import test from 'node:test'
import assert from 'node:assert/strict'
import { accessoryChanges, activityOptions, displayOuter, sceneView } from '../src/recommend/situation.ts'
import type { RecommendationView } from '../src/recommend/types.ts'

test('activity tags use the server occasion map and respect its deployment switch', () => {
  const activities = [{ id: 'SPORT.run', label: '跑步' }]
  assert.deepEqual(activityOptions({ enabled: true, occasions: { SPORT: activities } }, 'SPORT'), activities)
  assert.deepEqual(activityOptions({ enabled: false, occasions: { SPORT: activities } }, 'SPORT'), [])
  assert.deepEqual(activityOptions({ enabled: true, occasions: {} }, 'DAILY'), [])
  assert.deepEqual(activityOptions(null, 'SPORT'), [])
})
test('outer display follows the exact scoring identifier including a second legacy option', () => {
  const thin = { id: 'thin', name: '外套', reasons: [] }, warm = { id: 'warm', name: '外套', reasons: [] }
  assert.equal(displayOuter({ outers: [thin, warm], displayOuter: warm }), warm)
  assert.equal(displayOuter({ outers: [thin, warm], displayOuter: null }), null)
  assert.equal(displayOuter({ outers: [thin, warm] }), null)
})
test('each scene keeps its own operations run and removes recursive groups and private echo', () => {
  const view = { runId: 'first', intent: { description: '原条件', occasion: 'DAILY', activity: 'DAILY.walk', situation: { private: ['私人备注'] } }, outfits: [], groups: [], pendingGroups: true, notes: [], limits: [], hasMore: true, emptyReason: '' } as unknown as RecommendationView
  const next = sceneView(view, { occasion: 'COMMUTE', label: '通勤', runId: 'commute', outfits: [] })
  assert.equal(next.runId, 'commute'); assert.equal(next.intent.description, '通勤')
  assert.equal(next.intent.occasion, 'COMMUTE'); assert.equal(next.intent.activity, undefined)
  assert.equal(next.intent.situation, undefined); assert.equal(next.groups, undefined); assert.equal(next.pendingGroups, false)
  assert.equal(view.runId, 'first')
})
test('untouched accessory suggestions never count as removal and each real edit is reported once', () => {
  const source = { recommendationLogId: 'log', accessoryStates: { clip: false, scarf: true } }
  assert.deepEqual(accessoryChanges(source, ['top', 'scarf']), [])
  assert.deepEqual(accessoryChanges(source, ['top', 'clip']), [
    { kind: 'ACCESSORY_KEPT', logId: 'log', garmentId: 'clip' },
    { kind: 'ACCESSORY_REMOVED', logId: 'log', garmentId: 'scarf' },
  ])
  assert.deepEqual(accessoryChanges(source, ['clip']), [])
  assert.deepEqual(accessoryChanges(source, ['clip', 'scarf']), [{ kind: 'ACCESSORY_KEPT', logId: 'log', garmentId: 'scarf' }])
})
test('legacy drafts carry no recommendation events', () => { assert.deepEqual(accessoryChanges({}, ['g']), []) })
