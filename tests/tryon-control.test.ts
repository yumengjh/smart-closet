import test from 'node:test'
import assert from 'node:assert/strict'
import { bindControlPlane } from '../src/tryon/sdkBridge.ts'
const lease = '00000000-0000-0000-0000-000000000001'
function manager() { return { connectionManager: { dependencies: { sessionService: { apiService: { post: () => { throw new Error('must not reach upstream') } }, createSession() {}, heartbeatSession() {}, closeSession() {} } } } } }
test('SDK control calls carry only a backend lease and cannot pick an arbitrary path', async () => {
  const m = manager(), calls: {path:string;init:RequestInit}[] = []
  bindControlPlane(m, () => lease, async (path, init) => { calls.push({path,init}); return {} })
  const bridge = m.connectionManager.dependencies.sessionService.apiService as unknown as {post(path:string):Promise<unknown>;put(path:string):Promise<unknown>;delete(path:string):Promise<unknown>}
  await bridge.post('/session'); await bridge.put('/session/ums-1/heartbeat'); await bridge.delete('/session/ums-1')
  assert.deepEqual(calls.map(c => [c.path,c.init.method]),[[`/api/tryon/sessions/${lease}/sdk/session`,'POST'],[`/api/tryon/sessions/${lease}/sdk/session/ums-1/heartbeat`,'PUT'],[`/api/tryon/sessions/${lease}/sdk/session/ums-1`,'DELETE']])
  await assert.rejects(bridge.post('/balance')); await assert.rejects(bridge.put('/session/../../balance')); assert.equal(calls.length,3)
})
test('ABI changes and missing lease fail closed', async () => {
  assert.throws(() => bindControlPlane({},()=>lease,async()=>{}))
  const m=manager();let called=false;bindControlPlane(m,()=>'',async()=>{called=true});await assert.rejects(m.connectionManager.dependencies.sessionService.apiService.post('/session'));assert.equal(called,false)
})
