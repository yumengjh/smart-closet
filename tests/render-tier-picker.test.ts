import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { parse, compileScript } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'

test('档位选择按服务端单位和降级开关展示', async () => {
  const virtualId = '/src/components/try/tier-picker-test.ts'
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{
    name: 'tier-picker-test',
    resolveId(id) { if (id === virtualId) return id },
    load(id) { if (id === virtualId) return compileScript(parse(readFileSync('src/components/try/RenderTierPicker.vue', 'utf8')).descriptor, { id: 'tier-picker-test', inlineTemplate: true }).content },
  }], server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: Picker } = await server.ssrLoadModule(virtualId)
    const Stub = defineComponent({ inheritAttrs: false, setup(_, { attrs, slots }) { return () => h('div', attrs, slots.default?.()) } })
    const render = async (enabled: boolean, degradeEnabled: boolean, multiplier: number | null = 1) => {
      const app = createSSRApp(Picker, { config: { enabled, selected: 'PREMIUM', degradeEnabled, tiers: [{ tier: 'STANDARD', units: 2, available: true }, { tier: 'PREMIUM', units: 5, available: false }] }, modelValue: 'PREMIUM', multiplier })
      app.component('a-radio-group', Stub); app.component('a-radio', Stub)
      return renderToString(app)
    }
    const degrade = await render(true, true, 2)
    assert.match(degrade, /标准.*每张 4 次/); assert.match(degrade, /高质量.*每张 10 次/); assert.match(degrade, /暂时不可用，会用标准完成/)
    const noDegrade = await render(true, false)
    assert.match(noDegrade, /暂时不可用，请换标准/); assert.match(noDegrade, /disabled/)
    assert.doesNotMatch(await render(true, true, null), /每张/)
    assert.doesNotMatch(await render(false, true), /高质量/)
  } finally { await server.close() }
})
