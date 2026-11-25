import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { ApiError } from '../src/domain/apiError.ts'
import { createChallengeSolver, type PowChallenge } from '../src/domain/proofOfWork.ts'
import {
  codeButtonLabel, codeProblem, emailCodeFailure, emailProblem, emailRequired, emailStatus, mailEnabled, normalizeCode, registerErrorStep, sendWithProof, waitLabel,
} from '../src/domain/emailAccount.ts'

// 假 Worker：收到题目后异步回一个 nonce（或报错），记录是否被停掉。
type FakeWorker = { onmessage: ((event: { data: { nonce: string | null } }) => void) | null; onerror: (() => void) | null; terminated: boolean; postMessage: (data: { token: string }) => void; terminate: () => void }
function fakeWorkers(reply: (token: string) => string | null | 'error' = token => `nonce-for-${token}`) {
  const made: FakeWorker[] = []
  const spawn = () => {
    const worker: FakeWorker = {
      onmessage: null, onerror: null, terminated: false,
      postMessage: ({ token }) => setTimeout(() => { if (worker.terminated) return; const answer = reply(token); if (answer === 'error') worker.onerror?.(); else worker.onmessage?.({ data: { nonce: answer } }) }, 0),
      terminate: () => { worker.terminated = true },
    }
    made.push(worker); return worker as unknown as Worker
  }
  return { spawn, made }
}
function challenges(minWaitMs = 0) {
  let issued = 0
  return { fetch: async (): Promise<PowChallenge> => ({ token: `t${++issued}`, difficulty: 1, minWaitMs }), count: () => issued }
}

test('邮件关闭时服务端不带新字段，界面据此不显示邮箱入口', () => {
  assert.equal(mailEnabled({ mode: 'OPEN' } as { emailRequired?: unknown }), false)
  assert.equal(emailRequired({ mode: 'OPEN' } as { emailRequired?: unknown }), false)
  assert.equal(mailEnabled({ emailRequired: false }), true, '邮件开着但注册不要求邮箱：登录页仍可找回密码')
  assert.equal(emailRequired({ emailRequired: false }), false)
  assert.equal(emailRequired({ emailRequired: true }), true)
  assert.equal(mailEnabled(null), false)
  assert.equal(emailStatus({ username: 'a' } as { emailBound?: unknown }), null)
  assert.deepEqual(emailStatus({ emailBound: false }), { bound: false, masked: null })
  assert.deepEqual(emailStatus({ emailBound: true, emailMasked: 'y***@qq.com' }), { bound: true, masked: 'y***@qq.com' })
  assert.deepEqual(emailStatus({ emailBound: false, emailMasked: null }), { bound: false, masked: null }, 'DELETE /email 的响应')
})

test('验证码只留 6 位半角数字，邮箱粗查格式', () => {
  assert.equal(normalizeCode('123 456'), '123456')
  assert.equal(normalizeCode('１２３４５６7'), '123456')
  assert.equal(normalizeCode('ab12'), '12')
  assert.equal(codeProblem(''), '请填写验证码。')
  assert.equal(codeProblem('12345'), '验证码是 6 位数字。')
  assert.equal(codeProblem('123456'), '')
  assert.equal(emailProblem(''), '请填写邮箱。')
  assert.equal(emailProblem('yuda@'), '邮箱格式不正确。')
  assert.equal(emailProblem(' Yuda@QQ.com '), '')
  assert.equal(emailProblem(`${'a'.repeat(250)}@q.cn`), '邮箱格式不正确。')
})

test('取码失败的提示与倒计时：429 按 Retry-After 等，其余直接给服务端的话', () => {
  assert.deepEqual(emailCodeFailure(new ApiError('请求太频繁，请稍后再试', 429, 'EMAIL_CODE_THROTTLED', '42')), { message: '请求太频繁，请稍后再试。', waitSeconds: 42 })
  assert.deepEqual(emailCodeFailure(new ApiError('密码验证次数过多，请稍后再试。', 429, 'LOGIN_THROTTLED', '900')), { message: '密码验证次数过多，请稍后再试。', waitSeconds: 900 })
  assert.deepEqual(emailCodeFailure(new ApiError('当前密码不正确。', 400, 'INVALID_PASSWORD')), { message: '当前密码不正确。', waitSeconds: 0 })
  assert.deepEqual(emailCodeFailure(new ApiError('这个邮箱已经绑定在你的账号上了。', 400, 'EMAIL_ALREADY_BOUND')), { message: '这个邮箱已经绑定在你的账号上了。', waitSeconds: 0 })
  assert.deepEqual(emailCodeFailure(new ApiError('x', 400, 'EMAIL_CHALLENGE_INVALID')), { message: '安全校验没有通过，请再点一次发送。', waitSeconds: 0 })
  assert.deepEqual(emailCodeFailure(new ApiError('邮件功能未开启。', 404, 'EMAIL_DISABLED')), { message: '邮件功能暂时没有开启。', waitSeconds: 0 })
  assert.equal(emailCodeFailure(new ApiError('x', 429, 'EMAIL_CODE_THROTTLED', 'soon')).waitSeconds, 0, '读不懂的 Retry-After 不倒计时')
  assert.equal(emailCodeFailure(new Error('网络断了')).message, '网络断了')
})

test('按钮文字：发送中、倒计时、重新获取', () => {
  assert.equal(codeButtonLabel({ sending: true, waitSeconds: 0, sent: false }), '发送中')
  assert.equal(codeButtonLabel({ sending: false, waitSeconds: 0, sent: false }), '获取验证码')
  assert.equal(codeButtonLabel({ sending: false, waitSeconds: 59, sent: true }), '59 秒后重发')
  assert.equal(codeButtonLabel({ sending: false, waitSeconds: 0, sent: true }), '重新获取')
  assert.equal(waitLabel(61), '2 分钟')
  assert.equal(waitLabel(3601), '2 小时')
})

test('注册被拒时回到出错的那一步', () => {
  assert.equal(registerErrorStep(new ApiError('验证码不正确或已失效', 400, 'EMAIL_CODE_INVALID')), 0)
  assert.equal(registerErrorStep(new ApiError('请填写邮箱和验证码。', 400, 'EMAIL_REQUIRED')), 0)
  assert.equal(registerErrorStep(new ApiError('用户名已被使用。', 409, 'USERNAME_TAKEN')), 0)
  assert.equal(registerErrorStep(new ApiError('邀请码无效或已过期。', 400, 'INVITE_INVALID')), 0)
  assert.equal(registerErrorStep(new ApiError('密码至少需要 12 个字符。', 400, 'INVALID_REQUEST')), 1)
  assert.equal(registerErrorStep(new ApiError('注册过于频繁，请稍后再试。', 429, 'REGISTRATION_THROTTLED')), -1)
})

test('安全校验：ready 复用算好的题，prepare 换新题，等够最短时间', async () => {
  const source = challenges(30); const workers = fakeWorkers()
  const pow = createChallengeSolver(source.fetch, workers.spawn, '不支持')
  const started = Date.now()
  const first = await pow.ready()
  assert.ok(Date.now() - started >= 25, '等够 minWaitMs 才交出去')
  assert.deepEqual(first, { challenge: 't1', nonce: 'nonce-for-t1' })
  assert.deepEqual(await pow.ready(), first, '没换题前 ready 拿同一份')
  assert.deepEqual(await pow.prepare(), { challenge: 't2', nonce: 'nonce-for-t2' })
  assert.equal(source.count(), 2)
  assert.ok(workers.made.every(w => w.terminated), '算完的 Worker 都停掉')
})

test('安全校验：Worker 出错给调用方的话，失败后下次重新算；cancel 停掉正在算的', async () => {
  let fail = true
  const workers = fakeWorkers(token => fail ? 'error' : token)
  const pow = createChallengeSolver(challenges().fetch, workers.spawn, '这个浏览器没法完成安全校验，换个浏览器再试试。')
  await assert.rejects(pow.ready(), /换个浏览器/)
  fail = false
  assert.equal((await pow.ready()).challenge, 't2')
  const slow = fakeWorkers(() => null)
  const cancelled = createChallengeSolver(challenges().fetch, slow.spawn, 'x')
  void cancelled.prepare().catch(() => {})
  await new Promise(resolve => setImmediate(resolve))
  cancelled.cancel()
  assert.equal(slow.made[0]?.terminated, true)
})

test('取码：题目失效时换一道新题自动再发一次，用过的题不再用', async () => {
  const pow = createChallengeSolver(challenges().fetch, fakeWorkers().spawn, 'x')
  const sent: string[] = []
  const result = await sendWithProof(async proof => {
    sent.push(proof.challenge)
    if (sent.length === 1) throw new ApiError('安全校验没有通过，请再点一次发送。', 400, 'EMAIL_CHALLENGE_INVALID')
    return { cooldownSeconds: 60 }
  }, pow)
  assert.deepEqual(result, { cooldownSeconds: 60 })
  assert.deepEqual(sent, ['t1', 't2'])
  assert.equal((await pow.ready()).challenge, 't3', '发完就预备下一道，给“重新获取”用')
  await assert.rejects(sendWithProof(async () => { throw new ApiError('邮箱格式不正确。', 400, 'EMAIL_INVALID') }, pow), /邮箱格式不正确/)
  assert.equal((await pow.ready()).challenge, 't4', '其他错误不重发，但同样换题')
})

// 请求层：打包一次，让 api.ts 与 emailAccount.ts 共用同一个模块实例。
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export { emailApi } from './src/services/emailAccount.ts'
    export { forgetCsrfToken } from './src/services/api.ts'
    export * from './src/domain/accountSession.ts'` },
  bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env.VITE_USE_MOCKS': '"false"', 'import.meta.env.VITE_API_BASE_URL': '""' },
})
const m = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const isCsrf = (url: unknown) => String(url).endsWith('/api/auth/csrf')
test.beforeEach(() => { m.resetAccountSession(); m.forgetCsrfToken() })

test('接口：请求体与方法和服务端一致，带 CSRF', async t => {
  const seen: { url: string; method: string; body: unknown; csrf: string | null }[] = []
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit = {}) => {
    if (isCsrf(url)) return Response.json({ token: 'csrf-1' })
    seen.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(String(init.body)) : null, csrf: new Headers(init.headers).get('X-XSRF-TOKEN') })
    if (String(url).endsWith('/password-reset')) return new Response(null, { status: 204 })
    if (String(url).endsWith('/challenge')) return Response.json({ token: 'tok', difficulty: 20, minWaitMs: 3000 })
    if (String(url).endsWith('/api/auth/email')) return Response.json(init.method === 'DELETE' ? { emailBound: false, emailMasked: null } : { emailBound: true, emailMasked: 'y***@qq.com' })
    return Response.json({ cooldownSeconds: 60 }, { status: 202 })
  })
  const proof = { challenge: 'tok', nonce: '42' }
  assert.deepEqual(await m.emailApi.challenge(), { token: 'tok', difficulty: 20, minWaitMs: 3000 })
  assert.deepEqual(await m.emailApi.requestCode('REGISTER', ' a@qq.com ', proof), { cooldownSeconds: 60 })
  await m.emailApi.requestCode('RESET', ' alice ', proof)
  assert.equal(await m.emailApi.resetPassword('alice', '123456', 'a-long-password!'), undefined)
  await m.emailApi.requestBindCode('b@qq.com', 'secret')
  assert.deepEqual(await m.emailApi.bind('b@qq.com', '654321'), { emailBound: true, emailMasked: 'y***@qq.com' })
  assert.deepEqual(await m.emailApi.unbind('secret'), { emailBound: false, emailMasked: null })
  assert.deepEqual(seen.map(({ url, method, body }) => [url, method, body]), [
    ['/api/auth/email-code/challenge', 'GET', null],
    ['/api/auth/email-code', 'POST', { purpose: 'REGISTER', email: 'a@qq.com', challenge: 'tok', nonce: '42' }],
    ['/api/auth/email-code', 'POST', { purpose: 'RESET', login: 'alice', challenge: 'tok', nonce: '42' }],
    ['/api/auth/password-reset', 'POST', { login: 'alice', code: '123456', newPassword: 'a-long-password!' }],
    ['/api/auth/email/code', 'POST', { email: 'b@qq.com', currentPassword: 'secret' }],
    ['/api/auth/email', 'PUT', { email: 'b@qq.com', code: '654321' }],
    ['/api/auth/email', 'DELETE', { currentPassword: 'secret' }],
  ])
  assert.ok(seen.filter(s => s.method !== 'GET').every(s => s.csrf === 'csrf-1'))
})

test('接口：429 带回 Retry-After，换成倒计时', async t => {
  t.mock.method(globalThis, 'fetch', async (url: unknown) => isCsrf(url) ? Response.json({ token: 'c' })
    : Response.json({ code: 'EMAIL_CODE_THROTTLED', message: '请求太频繁，请稍后再试', retryAfterSeconds: 37 }, { status: 429, headers: { 'Retry-After': '37' } }))
  const cause = await m.emailApi.requestCode('RESET', 'alice', { challenge: 'x', nonce: '1' }).catch((e: unknown) => e)
  assert.equal(cause.code, 'EMAIL_CODE_THROTTLED')
  assert.deepEqual(emailCodeFailure(new ApiError(cause.message, cause.status, cause.code, cause.retryAfter)), { message: '请求太频繁，请稍后再试。', waitSeconds: 37 })
})
