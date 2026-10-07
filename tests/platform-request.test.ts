import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle=await build({entryPoints:['src/services/platform.ts'],bundle:true,format:'esm',platform:'node',write:false,define:{'import.meta.env.VITE_USE_MOCKS':'"false"','import.meta.env.VITE_API_BASE_URL':'""'}})
const {platformRequest,PlatformRequestError}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const csrf=()=>Response.json({token:'test-token'})
test('lost submission response is uncertain and never automatically repeats POST',async t=>{
 const calls:string[]=[];t.mock.method(globalThis,'fetch',async(url:unknown)=>{calls.push(String(url));if(String(url).endsWith('/csrf'))return csrf();throw new TypeError('Failed to fetch')})
 await assert.rejects(platformRequest('/api/me/person-baselines','POST',{},'same-key'),(e:Error&{uncertain:boolean})=>e instanceof PlatformRequestError&&e.uncertain&&!e.message.includes('TypeError'))
 assert.deepEqual(calls,['/api/auth/csrf','/api/me/person-baselines'])
})
test('CSRF connection failure does not imply that a task was submitted',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new TypeError('Failed to fetch')})
 await assert.rejects(platformRequest('/api/me/person-baselines','POST',{},'same-key'),(e:Error&{uncertain:boolean})=>!e.uncertain)
 assert.equal(calls,1)
})
test('explicit validation rejection remains certain and preserves the service message',async t=>{
 t.mock.method(globalThis,'fetch',async(url:unknown)=>String(url).endsWith('/csrf')?csrf():Response.json({message:'资料已经变化，请重新核对。'},{status:409}))
 await assert.rejects(platformRequest('/api/me/person-baselines','POST',{},'same-key'),(e:Error&{uncertain:boolean;status:number})=>!e.uncertain&&e.status===409&&e.message==='资料已经变化，请重新核对。')
})
test('gateway failure and an unreadable success body require reconciliation',async t=>{
 for(const response of [Response.json({message:'网关未完成'},{status:502}),new Response('invalid JSON',{status:200})]){
 t.mock.method(globalThis,'fetch',async(url:unknown)=>String(url).endsWith('/csrf')?csrf():response)
 await assert.rejects(platformRequest('/api/me/person-baselines','POST',{},'same-key'),(e:Error&{uncertain:boolean})=>e.uncertain)
 t.mock.restoreAll()
 }
})
test('upload deadline aborts the request while keeping the outcome uncertain',async t=>{
 t.mock.method(globalThis,'fetch',async(url:unknown,options:RequestInit)=>String(url).endsWith('/csrf')?csrf():new Promise((_resolve,reject)=>options.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))))
 await assert.rejects(platformRequest('/api/me/person-baselines','POST',{},'same-key',{timeoutMs:20}),(e:Error&{uncertain:boolean})=>e.uncertain&&e.message.includes('超时'))
})
test('multipart uses the same submission key and does not force a JSON content type',async t=>{
 const body=new FormData();body.append('file',new Blob(['fixture']), 'fixture.png');let captured:RequestInit|undefined
 t.mock.method(globalThis,'fetch',async(url:unknown,options:RequestInit)=>{if(String(url).endsWith('/csrf'))return csrf();captured=options;return Response.json({id:'job'})})
 assert.deepEqual(await platformRequest('/api/me/person-baselines/upload-and-generate','POST',body,'same-key'),{id:'job'})
 assert.equal((captured!.headers as Headers).get('Idempotency-Key'),'same-key');assert.equal((captured!.headers as Headers).has('Content-Type'),false);assert.equal(captured!.body,body)
})
