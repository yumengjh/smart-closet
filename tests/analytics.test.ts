import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { analyticsEventSpecs, analyticsPages, analyticsVersion } from '../src/services/analyticsEvents.generated.ts'
import {
  BATCH_SIZE, EventQueue, QUEUE_LIMIT, analyticsActive, doNotTrack, externalReferrer, intakeCountBucket, pageTemplate, screenSize, validEvent, validProps, type WireEvent,
} from '../src/services/analyticsCore.ts'
import { render } from '../scripts/sync-analytics.mjs'

const on = { mocks: false, doNotTrack: false, appEnabled: true, admin: false, optOut: false }
const specs = analyticsEventSpecs as Record<string, (typeof analyticsEventSpecs)[keyof typeof analyticsEventSpecs]>

test('五种停用情况都不发送：未启用、用户关闭、请勿追踪、管理员、mock', () => {
  assert.equal(analyticsActive(on), true)
  assert.equal(analyticsActive({ ...on, appEnabled: false }), false)
  assert.equal(analyticsActive({ ...on, optOut: true }), false)
  assert.equal(analyticsActive({ ...on, doNotTrack: true }), false)
  assert.equal(analyticsActive({ ...on, admin: true }), false)
  assert.equal(analyticsActive({ ...on, mocks: true }), false)
})

test('请勿追踪：doNotTrack 为 1 或 globalPrivacyControl 为 true', () => {
  assert.equal(doNotTrack({ doNotTrack: '1' }), true)
  assert.equal(doNotTrack({ globalPrivacyControl: true }), true)
  assert.equal(doNotTrack({ doNotTrack: '0' }), false)
  assert.equal(doNotTrack({ doNotTrack: null }), false)
  assert.equal(doNotTrack(undefined), false)
})

test('路由归一化：用匹配到的模板，settings 带 section，admin 与未知页不报', () => {
  assert.equal(pageTemplate('/garment/:id', undefined, analyticsPages), '/garment/:id')
  assert.equal(pageTemplate('/outfits/:id', undefined, analyticsPages), '/outfits/:id')
  assert.equal(pageTemplate('/settings', 'style', analyticsPages), '/settings/style')
  assert.equal(pageTemplate('/settings', undefined, analyticsPages), '/settings')
  assert.equal(pageTemplate('/settings', 'users', analyticsPages), null)
  assert.equal(pageTemplate('/settings', ['style'], analyticsPages), '/settings')
  assert.equal(pageTemplate('/admin', undefined, analyticsPages), null)
  assert.equal(pageTemplate('/admin/users', undefined, analyticsPages), null)
  assert.equal(pageTemplate('/admin', 'style', analyticsPages), null)
  assert.equal(pageTemplate('/nowhere', undefined, analyticsPages), null)
  assert.equal(pageTemplate(undefined, undefined, analyticsPages), null)
  // 具体 id 不是模板，不能上报。
  assert.equal(pageTemplate('/garment/12', undefined, analyticsPages), null)
})

test('来源只留外站 origin；屏幕尺寸格式', () => {
  assert.equal(externalReferrer('https://example.com/a/b?q=1', 'https://closet.test'), 'https://example.com')
  assert.equal(externalReferrer('https://closet.test/today', 'https://closet.test'), undefined)
  assert.equal(externalReferrer('', 'https://closet.test'), undefined)
  assert.equal(externalReferrer('android-app://com.x', 'https://closet.test'), undefined)
  assert.equal(externalReferrer('not a url', 'https://closet.test'), undefined)
  assert.match(screenSize(390, 844), /^\d{2,5}x\d{2,5}$/)
  assert.equal(screenSize(390, 844), '390x844')
})

test('校验：未登记事件、多余字段、缺字段、错误枚举、错误类型都丢弃', () => {
  assert.equal(validEvent(specs, 'today_swipe', { dir: 'left' }, false), true)
  assert.equal(validEvent(specs, 'welcome_finish', {}, false), true)
  assert.equal(validEvent(specs, 'intake_submit', { count: '2-5', recognize: 'online', wanted: false }, false), true)
  assert.equal(validEvent(specs, 'nope', {}, false), false)
  assert.equal(validEvent(specs, 'constructor', {}, false), false)
  assert.equal(validEvent(specs, 'today_swipe', { dir: 'left', id: '12' }, false), false)
  assert.equal(validEvent(specs, 'today_swipe', {}, false), false)
  assert.equal(validEvent(specs, 'today_swipe', { dir: 'up' }, false), false)
  assert.equal(validEvent(specs, 'intake_submit', { count: '2-5', recognize: 'online', wanted: 'false' }, false), false)
  assert.equal(validEvent(specs, 'welcome_finish', { extra: true }, false), false)
  assert.equal(validProps(specs.today_swipe, null), false)
  assert.equal(validProps(specs.today_swipe, ['left']), false)
})

test('收费事件只在收费开启时发', () => {
  const props = { kind: 'points', result: 'ok' }
  assert.equal(validEvent(specs, 'billing_purchase', props, false), false)
  assert.equal(validEvent(specs, 'billing_purchase', props, true), true)
})

test('一期的 12 个事件都已登记，且属性只有枚举或布尔', () => {
  const phase1 = ['app_open', 'auth_register_success', 'welcome_step', 'welcome_finish', 'today_swipe', 'today_worn', 'add_source', 'intake_submit', 'outfit_save', 'try_make_start', 'try_make_result', 'assistant_open']
  assert.deepEqual(Object.keys(specs).filter(name => specs[name].phase === 1).sort(), [...phase1].sort())
  for (const spec of Object.values(specs)) for (const rule of Object.values(spec.props)) assert.ok('enum' in rule || rule.type === 'boolean')
})

test('count 分档：1 / 2-5 / 6+', () => {
  assert.deepEqual([1, 2, 5, 6, 10].map(intakeCountBucket), ['1', '2-5', '2-5', '6+', '6+'])
})

const event = (n: number): WireEvent => ({ kind: 'event', name: 'today_swipe', path: '/today', props: { dir: n % 2 ? 'left' : 'right' } })

test('队列：满一批提示发送，一次取一批，其余留下', () => {
  const queue = new EventQueue()
  for (let i = 0; i < BATCH_SIZE - 1; i++) assert.equal(queue.push(event(i)), false)
  assert.equal(queue.push(event(99)), true)
  for (let i = 0; i < 5; i++) queue.push(event(i))
  assert.equal(queue.take().length, BATCH_SIZE)
  assert.equal(queue.size, 5)
  queue.clear()
  assert.equal(queue.size, 0)
})

test('队列：超过上限丢最早的', () => {
  const queue = new EventQueue()
  for (let i = 0; i < QUEUE_LIMIT + 30; i++) queue.push({ kind: 'page', path: `/p${i}` })
  assert.equal(queue.size, QUEUE_LIMIT)
  assert.equal((queue.take()[0] as { path: string }).path, '/p30')
})

const serverEvents = new URL('../../smart-closet-server/src/main/resources/analytics/events.json', import.meta.url)
test('生成文件与 server 的 events.json 一致', { skip: !existsSync(serverEvents) && '相邻的 smart-closet-server 不存在' }, () => {
  const catalog = JSON.parse(readFileSync(serverEvents, 'utf8'))
  assert.equal(analyticsVersion, catalog.version)
  assert.equal(readFileSync(new URL('../src/services/analyticsEvents.generated.ts', import.meta.url), 'utf8'), render(catalog))
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|vue|js|mjs|css|json)$/.test(name) ? [path] : []
  })
}
const files = sourceFiles(new URL('../src', import.meta.url).pathname)

test('守护：只有 analytics.ts 与 analyticsCore.ts 能写出收集接口地址', () => {
  const offenders = files.filter(path => !/analytics(Core)?\.ts$/.test(path) && /['"`]\/api\/t['"`?]/.test(readFileSync(path, 'utf8')))
  assert.deepEqual(offenders, [])
})

test('守护：前端源码不出现具体统计平台的名字', () => {
  assert.deepEqual(files.filter(path => /umami/i.test(readFileSync(path, 'utf8'))), [])
})
