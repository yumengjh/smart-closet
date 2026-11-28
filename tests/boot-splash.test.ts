import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BOOT_SPLASH_FADE_MS, dismissBootSplash } from '../src/shell/bootSplash.ts'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('index.html carries the CSS-only boot splash before #app', () => {
  assert.ok(html.indexOf('id="boot"') > 0 && html.indexOf('id="boot"') < html.indexOf('id="app"'))
  const splash = html.slice(html.indexOf('id="boot"'), html.indexOf('id="app"'))
  assert.doesNotMatch(splash, /<script/)
  assert.match(html, /prefers-reduced-motion: reduce\) \{ #boot/)
  assert.match(html, /:root\[data-theme="dark"\] #boot/)
  assert.match(html, /rel="preload" as="image" href="\/yuda-logo-320.png"/)
})

function fakeSplash() {
  const classes = new Set<string>()
  const el = { dataset: {} as Record<string, string>, removed: false, classList: { add: (c: string) => classes.add(c) }, remove() { this.removed = true } }
  return { el, classes, doc: { getElementById: (id: string) => (id === 'boot' && !el.removed ? el : null) } as unknown as Document }
}

test('fades the splash out, then removes it once', () => {
  const { el, classes, doc } = fakeSplash()
  const timers: Array<[() => void, number]> = []
  const win = { matchMedia: () => ({ matches: false }), setTimeout: (fn: () => void, ms: number) => timers.push([fn, ms]) }
  dismissBootSplash(doc, win)
  dismissBootSplash(doc, win)
  assert.ok(classes.has('yb-out'))
  assert.equal(timers.length, 1)
  assert.equal(timers[0][1], BOOT_SPLASH_FADE_MS)
  assert.equal(el.removed, false)
  timers[0][0]()
  assert.equal(el.removed, true)
})

test('removes at once with reduced motion, and tolerates a missing splash', () => {
  const { el, classes, doc } = fakeSplash()
  dismissBootSplash(doc, { matchMedia: () => ({ matches: true }), setTimeout: () => assert.fail('no timer') })
  assert.equal(el.removed, true)
  assert.equal(classes.size, 0)
  dismissBootSplash(doc, { setTimeout: () => assert.fail('no timer') })
})
