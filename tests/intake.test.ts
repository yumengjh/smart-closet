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

test('returning from processed garment details restores the saved result cover and excludes completed selection', async()=>{
  const { freshSpriteTargets, restoreSpriteSelection, targetPreviewSource }=await import('../src/domain/intake.ts')
  const afterReload=JSON.parse(JSON.stringify([
    {id:'done-a',status:'SUCCEEDED',outputUrl:'/api/workflows/new-a/files/sticker.png'},
    {id:'done-b',status:'NEEDS_REVIEW',outputUrl:'/api/workflows/new-b/files/generated.png'},
    {id:'remaining',status:'DETECTED'},
    {id:'uncertain',status:'UNKNOWN'},
    {id:'active',status:'RUNNING'},
    {id:'confirmed',status:'SUCCEEDED',confirmed:true,outputUrl:'/api/confirmed.png'},
  ]))
  assert.deepEqual(restoreSpriteSelection(['done-a','done-b','active','confirmed','uncertain','remaining','remaining'],afterReload),['remaining'])
  assert.deepEqual(freshSpriteTargets(afterReload).map(t=>t.id),['remaining'])
  assert.deepEqual(targetPreviewSource(afterReload[0],{previewUrl:'/api/source.png'},true),{url:'/api/workflows/new-a/files/sticker.png',cropped:false})
  assert.deepEqual(targetPreviewSource(afterReload[0],{previewUrl:'/api/source.png'}),{url:'/api/source.png',cropped:true})
})
test('successful submission clears persisted IDs even when the selector has unmounted, retaining group preference', async()=>{
  const { clearSubmittedSpriteSelection }=await import('../src/domain/intake.ts')
  const data=new Map([['closet-batch:batch-a:sprite-selection',JSON.stringify({groupSize:4,ids:['a','b','other']})]])
  const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)}}
  clearSubmittedSpriteSelection(storage,'batch-a',['a','b'])
  assert.deepEqual(JSON.parse(data.get('closet-batch:batch-a:sprite-selection')!),{groupSize:4,ids:['other']})
})
