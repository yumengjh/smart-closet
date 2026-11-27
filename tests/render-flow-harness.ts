import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { createServer, transformWithEsbuild } from 'vite'
import { createRenderer, defineComponent, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { routeLocationKey, routerKey } from 'vue-router'
import { App } from 'ant-design-vue'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'

const pages = ['TryMaker', 'TryAlbumPage', 'SettingsPersonalSection', 'ResultViewer', 'RenderTierPicker', 'OotdConfirmModal', 'OotdMore']
const controls = new Set(['RouterLink'])
export const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', plugins: [{
    name: 'render-flow-test',
    async load(id) {
      if (!id.endsWith('.vue')) return
      const name = basename(id, '.vue')
      if (!pages.includes(name)) return 'export default { render: () => null }'
      const { descriptor } = parse(readFileSync(id, 'utf8'))
      for (const tag of descriptor.template!.content.matchAll(/<(a-[\w-]+)/g)) controls.add(tag[1])
      const script = compileScript(descriptor, { id: name, inlineTemplate: true })
      return (await transformWithEsbuild(script.content, id + '.ts', { loader: 'ts' })).code
    },
  }],
})

type Element = { tag: string; value: string; attrs: Record<string, any>; children: Element[]; parent?: Element }
const element = (tag: string, value = ''): Element => ({ tag, value, attrs: {}, children: [] })
function remove(child: Element) {
  if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
  child.parent = undefined
}
const renderer = createRenderer<Element, Element>({
  createElement: tag => element(tag), createText: text => element('text', text), createComment: () => element('comment'),
  insert(child, parent, anchor) { remove(child); child.parent = parent; parent.children.splice(anchor ? parent.children.indexOf(anchor) : parent.children.length, 0, child) },
  remove, setText: (n, text) => { n.value = text }, setElementText: (n, text) => { n.value = text; n.children = [] },
  parentNode: n => n.parent || null, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] || null,
  patchProp: (n, key, _, value) => { n.attrs[key] = value },
})
export const text = (n: Element): string => [n.value, n.attrs.message, ...n.children.map(text)].filter(Boolean).join(' ').trim()
export const all = (n: Element): Element[] => [n, ...n.children.flatMap(all)]
export const flush = async () => { await setImmediate(); await nextTick() }
export async function mount(t: TestContext, path: string, query = {}) {
  const { default: Component } = await server.ssrLoadModule('/src/' + path + '.vue')
  const pinia = createPinia(), root = element('root'), app = renderer.createApp(Component)
  const notices: string[] = [], confirms: {content: string; okText: string; onOk: () => Promise<void>}[] = [], routes: unknown[] = []
  const notify = (value: string) => notices.push(value)
  t.mock.method(App, 'useApp', () => ({ message: { info: notify, error: notify, success: notify }, modal: { confirm: (o: typeof confirms[number]) => confirms.push(o) } }))
  app.provide(routeLocationKey, { query } as never); app.provide(routerKey, { push: (r: unknown) => routes.push(r), replace() {} } as never)
  for (const tag of controls) app.component(tag, defineComponent({ inheritAttrs: false, setup(_, { attrs, slots }) { return () => h(tag, attrs,
    (tag === 'a-modal' || tag === 'a-drawer') && !attrs.open ? [] : Object.values(slots).flatMap(slot => slot?.() || [])) } }))
  app.use(pinia); app.mount(root); t.after(() => app.unmount()); await flush()
  const find = (tag: string, label?: RegExp) => all(root).find(n => n.tag === tag && (!label || label.test(text(n))))
  const button = (label: RegExp) => { const n = find('a-button', label); assert.ok(n, `missing button ${label}: ${text(root)}`); return n }
  const click = async (label: RegExp) => { const n = button(label); if (!n.attrs.disabled) await n.attrs.onClick?.(); await flush() }
  return { root, find, button, click, pinia, notices, confirms, routes }
}
