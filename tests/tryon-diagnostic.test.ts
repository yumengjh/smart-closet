import test from 'node:test'
import assert from 'node:assert/strict'
import { StartupDiagnostic } from '../src/tryon/diagnostic.ts'
test('session creation is not RTC readiness, and timing callbacks do not falsely advance it',()=>{
 const phases:string[]=[];const trace=new StartupDiagnostic(s=>phases.push(s));trace.start();trace.created(350)
 trace.timing({sessionMs:350,rtcJoinMs:1200,publishMs:100,credential:'must-not-copy'})
 assert.equal(trace.snapshot().stage,'JOINING_RTC');assert.deepEqual(trace.snapshot().timings,{sessionMs:350})
 trace.connected();assert.equal(trace.snapshot().stage,'WAITING_FRAME');assert.equal(trace.snapshot().timings.rtcJoinMs,1200)
 trace.frame();assert.equal(trace.snapshot().stage,'GENERATING');assert.deepEqual(phases,['CREATING_SESSION','JOINING_RTC','WAITING_FRAME','GENERATING'])
})
test('diagnostics drop unknown, sensitive and invalid fields and retain the failed attempt for inspection',()=>{
 const trace=new StartupDiagnostic();trace.start();trace.created(300);trace.quality('Down','Good')
 trace.video({sendFps:24,uplinkKbps:150,decodeFps:NaN,apiKey:'secret',referencePath:'https://private.invalid',uplinkLoss:-1})
 trace.end();trace.quality('Excellent','Excellent');trace.timing({sessionMs:10});
 assert.deepEqual(trace.snapshot().video,{sendFps:24,uplinkKbps:150});assert.equal(trace.snapshot().uplink,'Down');assert.equal(trace.snapshot().timings.sessionMs,300)
 assert.ok(!JSON.stringify(trace.snapshot()).includes('secret'));trace.start();assert.deepEqual(trace.snapshot().video,{})
})
