import test from 'node:test'
import assert from 'node:assert/strict'
import { eligible, generationUnits, imagePoint } from '../src/domain/intake.ts'
test('smart requires both visible extent and readable details; completion modes honor explicit targets',()=>{
  assert.equal(eligible(.79,true,'SMART'),false);assert.equal(eligible(.8,true,'SMART'),true);assert.equal(eligible(.99,false,'SMART'),false)
  assert.equal(eligible(.2,false,'FULL'),true);assert.equal(eligible(.2,false,'MANUAL'),true)
  assert.equal(generationUnits(3,2),2);assert.equal(generationUnits(0,1),0)
})
test('marking excludes letterbox and maps the visible photo coordinates',()=>{
  const rect={left:0,top:0,width:200,height:200}
  assert.equal(imagePoint(100,10,rect,200,100),null)
  assert.deepEqual(imagePoint(100,100,rect,200,100),{x:.5,y:.5})
})
