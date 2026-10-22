#!/usr/bin/env node
// Refreshes the Tencent Cloud CDN cache of the site after a deployment, so visitors get the new index.html and the
// unhashed static files (icons, illustrations, person stickers) at once. Hashed /assets/* never need a refresh.
//
// Environment:
//   TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY  CAM sub-user allowed only cdn:PurgePathCache and
//                                                     cdn:DescribePurgeTasks (policy yuda-cdn-purge)
//   CDN_PURGE_PATHS   directories to flush, comma separated (default: the origin of SITE_URL, with a trailing "/")
//   SITE_URL          the deployed site, used when CDN_PURGE_PATHS is empty
// Without the two secrets the step only prints a notice: a site without CDN deploys as before.
// Node built-ins only (no SDK), signed with TC3-HMAC-SHA256: https://cloud.tencent.com/document/api/228/30978
import { createHash, createHmac } from 'node:crypto'

const HOST = 'cdn.tencentcloudapi.com'
const SERVICE = 'cdn'
const VERSION = '2018-06-06'

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const hmac = (key, text) => createHmac('sha256', key).update(text, 'utf8').digest()

/** Hash of the canonical request; headers content-type, host and x-tc-action are signed. */
export function hashedCanonicalRequest(host, action, payload) {
  const canonical = ['POST', '/', '', `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`,
    'content-type;host;x-tc-action', sha256(payload)].join('\n')
  return sha256(canonical)
}

/** Headers for one API call, signed for the UTC date of the timestamp. */
export function signedHeaders({ secretId, secretKey, host = HOST, service = SERVICE, action, version = VERSION, payload, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const scope = `${date}/${service}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), scope, hashedCanonicalRequest(host, action, payload)].join('\n')
  const signingKey = hmac(hmac(hmac(`TC3${secretKey}`, date), service), 'tc3_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')
  return {
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': String(timestamp),
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`,
  }
}

/** Directories to flush: explicit list, else the site's origin. Each must be an http(s) URL ending in "/". */
export function purgePaths(env) {
  const raw = (env.CDN_PURGE_PATHS || '').trim()
  const list = raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : env.SITE_URL ? [new URL(env.SITE_URL).origin + '/'] : []
  for (const path of list) {
    if (!/^https?:\/\/[^/]+\/(.*\/)?$/.test(path)) throw new Error(`CDN_PURGE_PATHS 里的地址必须是以 / 结尾的目录：${path}`)
  }
  return list
}

async function call(credentials, action, body) {
  const payload = JSON.stringify(body)
  const headers = signedHeaders({ ...credentials, action, payload, timestamp: Math.floor(Date.now() / 1000) })
  const response = await fetch(`https://${HOST}`, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(20_000) })
  const data = await response.json()
  const error = data?.Response?.Error
  if (!response.ok || error) throw new Error(`${action} 失败：${error ? `${error.Code} ${error.Message}` : `HTTP ${response.status}`}`)
  return data.Response
}

async function main() {
  const secretId = process.env.TENCENTCLOUD_SECRET_ID || ''
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY || ''
  if (!secretId || !secretKey) {
    console.log('未配置 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY，跳过 CDN 缓存刷新。')
    return
  }
  const paths = purgePaths(process.env)
  if (!paths.length) throw new Error('没有要刷新的目录：请设置 CDN_PURGE_PATHS 或 SITE_URL。')
  const credentials = { secretId, secretKey }
  // "flush" refreshes only the files that changed at the origin, so unchanged hashed assets stay cached.
  const { TaskId } = await call(credentials, 'PurgePathCache', { Paths: paths, FlushType: 'flush' })
  console.log(`已提交 CDN 目录刷新：${paths.join(', ')}（任务 ${TaskId}）`)
  // Usually done within a minute; wait so the following check reads fresh files, but never fail the deployment on it.
  for (let i = 0; i < 18; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const { PurgeLogs = [] } = await call(credentials, 'DescribePurgeTasks', { TaskId })
    const states = PurgeLogs.map((log) => log.Status)
    if (states.length && states.every((state) => state === 'done')) { console.log('CDN 缓存刷新完成。'); return }
    if (states.includes('fail')) throw new Error(`CDN 刷新任务失败：${JSON.stringify(PurgeLogs)}`)
  }
  console.log('CDN 刷新任务仍在进行，通常数分钟内完成。')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exit(1) })
}
