import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { parse, compileScript } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRenderer, defineComponent, h, nextTick } from 'vue'

test('钱包开关关闭/403/404不渲染、不发起其他收费请求；开启后显示入口', async () => {
  // Compile the real client template so mounting exercises v-if and onMounted without a DOM dependency.
  const virtualId = '/src/billing/wallet-test.ts'
  const server = await createServer({
    configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      name: 'billing-component-test',
      resolveId(id) { if (id === virtualId) return id },
      load(id) {
        if (id !== virtualId) return
        const { descriptor } = parse(readFileSync('src/billing/WalletSection.vue', 'utf8'))
        // The shop is a separate component with its own requests; this test is about the wallet alone.
        return compileScript(descriptor, { id: 'billing-test', inlineTemplate: true }).content
          .replace(/import ShopSection from ['"]\.\/ShopSection\.vue['"]/, 'const ShopSection = { render: () => null }')
          .replace(/from (['"])(\.[^'"]+)\1/g, (_, quote, path) => `from ${quote}${resolve('src/billing', path)}${quote}`)
      },
    }],
    server: { middlewareMode: true }, appType: 'custom',
  })
  try {
    const { default: WalletSection } = await server.ssrLoadModule('/src/billing/wallet-test.ts')
    const { billingApi } = await server.ssrLoadModule('/src/billing/api.ts')
    type Node = { text: string; children: Node[]; parent?: Node }
    const node = (text = ''): Node => ({ text, children: [] })
    const renderer = createRenderer<Node, Node>({
      createElement: tag => node(tag), createText: text => node(text), createComment: () => node(),
      insert: (child, parent) => { child.parent = parent; parent.children.push(child) },
      remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(n => n !== child) },
      setText: (n, text) => { n.text = text }, setElementText: (n, text) => { n.text = text },
      parentNode: n => n.parent || null, nextSibling: () => null, patchProp: () => {},
    })
    let otherCalls = 0
    for (const key of ['redeem', 'batches', 'state', 'codes']) billingApi[key] = async () => { otherCalls++; throw new Error('不应调用') }
    const collect = (n: Node): string => [n.text, ...n.children.map(collect)].join(' ')
    for (const mode of ['disabled', '403', '404', 'enabled']) {
      let walletCalls = 0
      billingApi.wallet = async () => {
        walletCalls++
        if (mode === '403' || mode === '404') throw Object.assign(new Error('不可用'), { status: Number(mode) })
        return { enabled: mode === 'enabled', balance: 20, reserved: 2, entitlements: [], recent: [] }
      }
      const root = node(); const app = renderer.createApp(WalletSection)
      // Ant components are irrelevant to this test: preserve slots, hide closed modals.
      const Stub = defineComponent({ setup: (_, { slots }) => () => h('stub', slots.default?.()) })
      for (const name of ['a-space', 'a-button', 'a-alert', 'a-tag', 'a-empty', 'a-input', 'a-form-item', 'a-form']) app.component(name, Stub)
      app.component('a-modal', defineComponent({ setup: () => () => null }))
      app.mount(root)
      await new Promise(resolve => setTimeout(resolve, 0)); await nextTick()
      const text = collect(root)
      if (mode === 'enabled') { assert.match(text, /点数与权益/); assert.match(text, /兑换码/); assert.match(text, /正在使用中/) }
      else assert.doesNotMatch(text, /点数|权益|兑换码/)
      assert.equal(walletCalls, 1); assert.equal(otherCalls, 0)
      app.unmount()
    }
  } finally { await server.close() }
})
