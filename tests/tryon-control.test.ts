import test from 'node:test'
import assert from 'node:assert/strict'
import { bindControlPlane, tolerateSenderRace } from '../src/tryon/sdkBridge.ts'
import { XmaxClient, XmaxConfiguration, RealtimeConfiguration, RealtimeModel } from '@xmaxai/web-sdk'
const lease = '00000000-0000-0000-0000-000000000001'
function manager() { return { connectionManager: { dependencies: { sessionService: { apiService: { post: () => { throw new Error('must not reach upstream') } }, createSession() {}, heartbeatSession() {}, closeSession() {} } } } } }
test('SDK control calls carry only a backend lease and cannot pick an arbitrary path', async () => {
  const m = manager(), calls: {path:string;init:RequestInit}[] = []
  bindControlPlane(m, () => lease, async (path, init) => { calls.push({path,init}); return {} })
  const bridge = m.connectionManager.dependencies.sessionService.apiService as unknown as {post(path:string):Promise<unknown>;put(path:string, body?: unknown):Promise<unknown>;delete(path:string):Promise<unknown>}
  await bridge.post('/session'); await bridge.put('/session/ums-1/heartbeat', { firstHeartbeatGraceSeconds: 3 }); await bridge.put('/session/ums-1/heartbeat'); await bridge.delete('/session/ums-1')
  assert.deepEqual(calls.map(c => [c.path,c.init.method,c.init.body]),[[`/api/tryon/sessions/${lease}/sdk/session`,'POST','{}'],[`/api/tryon/sessions/${lease}/sdk/session/ums-1/heartbeat`,'PUT','{"firstHeartbeatGraceSeconds":3}'],[`/api/tryon/sessions/${lease}/sdk/session/ums-1/heartbeat`,'PUT',undefined],[`/api/tryon/sessions/${lease}/sdk/session/ums-1`,'DELETE',undefined]])
  await assert.rejects(bridge.post('/balance')); await assert.rejects(bridge.put('/session/../../balance')); assert.equal(calls.length,4)
})
test('ABI changes and missing lease fail closed', async () => {
  assert.throws(() => bindControlPlane({},()=>lease,async()=>{}))
  const m=manager();let called=false;bindControlPlane(m,()=>'',async()=>{called=true});await assert.rejects(m.connectionManager.dependencies.sessionService.apiService.post('/session'));assert.equal(called,false)
})
test('the installed SDK manager supports the control and sender bridges', async () => {
  const client = new XmaxClient(new XmaxConfiguration({ apiKey: 'fish-closet-server-controlled', loggerOptions: 0 }))
  const m = client.createRealtimeManager(new RealtimeConfiguration({ model: RealtimeModel.x2_1 }))
  bindControlPlane(m, () => lease, async () => ({}))
  tolerateSenderRace(m)
  await m.close()
})
const race = () => new Error('Browser did not retain WebRTC video sender parameters')
function rtcManager(configure: (...args: unknown[]) => Promise<unknown>, restore: (...args: unknown[]) => Promise<unknown> = async () => {}) { return { configureVideoEncoding: configure, restoreCameraSender: restore } }
const wrap = (rtc: object) => ({ connectionManager: { dependencies: { streamController: { rtcManager: rtc } } } })
test('a lost sender race retries with the same arguments and instance', async () => {
  let calls = 0, self: unknown, seen: unknown; const waits: number[] = []
  const rtc = rtcManager(async function (this: unknown, config) { calls++; self = this; seen = config; if (calls < 3) throw race(); return 'ok' })
  tolerateSenderRace(wrap(rtc), () => assert.fail('must not degrade'), async ms => { waits.push(ms) })
  assert.equal(await rtc.configureVideoEncoding({ width: 1 }), 'ok'); assert.equal(calls, 3); assert.equal(self, rtc); assert.deepEqual(seen, { width: 1 }); assert.deepEqual(waits, [150, 300])
})
test('a persistent mismatch keeps the connection and reports it once', async () => {
  let calls = 0, degraded = 0
  const rtc = rtcManager(async () => {}, async () => { calls++; throw race() })
  tolerateSenderRace(wrap(rtc), () => { degraded++ }, async () => {})
  assert.equal(await rtc.restoreCameraSender(), undefined); assert.equal(calls, 3); assert.equal(degraded, 1)
})
test('cancellation and real RTC failures are never swallowed or retried', async () => {
  let calls = 0
  const rtc = rtcManager(async () => { calls++; throw new Error('Agora operation was cancelled') })
  tolerateSenderRace(wrap(rtc), () => assert.fail('must not degrade'), async () => {})
  await assert.rejects(rtc.configureVideoEncoding(), /cancelled/); assert.equal(calls, 1)
})
test('an SDK layout change fails closed', () => {
  assert.throws(() => tolerateSenderRace({})); assert.throws(() => tolerateSenderRace(wrap({ configureVideoEncoding() {} })))
})
