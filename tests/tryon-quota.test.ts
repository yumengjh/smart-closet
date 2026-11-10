import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { parse, compileScript } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRenderer, defineComponent, h } from 'vue'

test('实时试穿额度兼容旧后端并显示点数时长与兑换入口', async t => {
  // Compile the real client template, as in billing-render.test.ts.
  const virtualId = '/src/tryon/quota-test.ts'
  const server = await createServer({
    configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'tryon-quota-test',
      resolveId(id) { if (id === virtualId) return id },
      load(id) {
        if (id !== virtualId) return
        const { descriptor } = parse(readFileSync('src/tryon/TryOnQuota.vue', 'utf8'))
        return compileScript(descriptor, { id: 'tryon-quota-test', inlineTemplate: true }).content
          .replace(/from (['"])(\.[^'"]+)\1/g, (_, quote, path) => `from ${quote}${resolve('src/tryon', path)}${quote}`)
      },
    }],
    server: { middlewareMode: true, hmr: false }, appType: 'custom',
  })
  try {
    const { default: TryOnQuota } = await server.ssrLoadModule(virtualId)
    type Node = { text: string; props: Record<string, unknown>; children: Node[]; parent?: Node }
    const node = (text = ''): Node => ({ text, props: {}, children: [] })
    const renderer = createRenderer<Node, Node>({
      createElement: () => node(), createText: text => node(text), createComment: () => node(),
      insert: (child, parent) => { child.parent = parent; parent.children.push(child) },
      remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(n => n !== child) },
      setText: (n, text) => { n.text = text }, setElementText: (n, text) => { n.text = text },
      parentNode: n => n.parent || null, nextSibling: () => null,
      patchProp: (n, key, _previous, value) => { n.props[key] = value },
    })
    const collect = (n: Node): string => [n.text, ...n.children.map(collect)].join(' ').replace(/\s+/g, ' ').trim()
    const links = (n: Node): unknown[] => [...(n.props.href ? [n.props.href] : []), ...n.children.flatMap(links)]
    function render(remaining: number, points?: { paidSeconds: number; milliPointsPerSecond: number }) {
      const root = node(), app = renderer.createApp(TryOnQuota, { remaining, points })
      // Keep Ant component slots and link attributes without needing a browser DOM.
      const Stub = defineComponent({ setup: (_, { slots }) => () => h('stub', slots.default?.()) })
      app.component('a-typography-text', Stub); app.component('a-button', Stub)
      app.mount(root)
      const result = { text: collect(root), links: links(root) }
      app.unmount()
      return result
    }
    await t.test('没有 points 字段时保留原有额度文案且不显示点数入口', () => {
      for (const remaining of [0, 125]) {
        assert.deepEqual(render(remaining), { text: remaining ? '今日剩余 02:05' : '今日剩余 00:00', links: [] })
      }
    })
    await t.test('价格为 0 时即使余额可用也保持原有行为', () => {
      for (const remaining of [0, 125]) {
        for (const paidSeconds of [0, 600]) {
          assert.deepEqual(render(remaining, { paidSeconds, milliPointsPerSecond: 0 }), { text: remaining ? '今日剩余 02:05' : '今日剩余 00:00', links: [] })
        }
      }
    })
    await t.test('免费有剩余时显示可用分钟与每分钟点数，最多两位小数且无多余 0', () => {
      for (const [milliPointsPerSecond, price] of [[1000, '60'], [25, '1.5'], [21, '1.26']] as const) {
        assert.deepEqual(render(125, { paidSeconds: 90, milliPointsPerSecond }), {
          text: `今日剩余 02:05 另可用点数试穿约 1.5 分钟（每分钟 ${price} 点）`, links: [],
        })
      }
      assert.equal(render(125, { paidSeconds: 0, milliPointsPerSecond: 25 }).text, '今日剩余 02:05 另可用点数试穿约 0 分钟（每分钟 1.5 点）')
    })
    await t.test('免费用完但点数够时提示将使用点数，分钟由可支付秒数换算', () => {
      for (const [paidSeconds, minutes] of [[600, '10'], [30, '0.5'], [100, '1.67']] as const) {
        assert.deepEqual(render(0, { paidSeconds, milliPointsPerSecond: 25 }), {
          text: `今日剩余 00:00 免费时长已用完，将使用点数，约可试穿 ${minutes} 分钟`, links: [],
        })
      }
    })
    await t.test('免费用完且点数不足时显示提示及现有点数兑换页链接', () => {
      assert.deepEqual(render(0, { paidSeconds: 0, milliPointsPerSecond: 25 }), {
        text: '今日剩余 00:00 免费时长已用完，点数不足 点数与兑换', links: ['/settings?section=quota'],
      })
      const routes = readFileSync('src/router.ts', 'utf8')
      assert.match(routes, /path: '\/settings'/)
      assert.match(readFileSync('src/views/SettingsPage.vue', 'utf8'), /key: 'quota'/)
      assert.match(readFileSync('src/views/settings/SettingsQuotaSection.vue', 'utf8'), /<WalletSection/)
    })
  } finally { await server.close() }
})
