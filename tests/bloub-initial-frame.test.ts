import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle=await build({entryPoints:['src/agent/bloub/engine.ts'],bundle:true,format:'esm',platform:'node',write:false})
const { BotEngine }=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
test('initial zero-duration gaze and subsequent transition render finite SVG coordinates',()=>{
  const engine=new BotEngine(100,'idle')
  engine.setLook(null,0,0)
  for(const t of [0,0.001,1]) {
    const frame=engine.sample(t)
    assert.ok(!/NaN|Infinity/.test(frame.bodyPath))
    for(const eye of frame.eyes) assert.ok(!/NaN|Infinity/.test(eye.matrix))
  }
  engine.setLook({yaw:20,pitch:5,mix:1,spin:0,wander:0},1)
  for(const t of [1,1.12,2]) for(const eye of engine.sample(t).eyes) assert.ok(!/NaN|Infinity/.test(eye.matrix))
})
