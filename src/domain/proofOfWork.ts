// 工作量证明的取题与计算（意见反馈与邮箱验证码共用，server 设计 2026-11-23-用户反馈 4.2 节、2026-11-24-邮件模块 4.2 节）。
// 拿题、在 Worker 里算（src/feedback/pow.worker.ts）、等够最短时间；题目一次性，每次 prepare() 都换一道新题，cancel() 停掉正在算的那道。
// 不依赖 Vue 与请求层，便于单测；Worker 由调用方创建（Vite 只认 new Worker(new URL(...)) 的写法）。
export type PowChallenge = { token: string; difficulty: number; minWaitMs: number }
export type PowProof = { challenge: string; nonce: string }
export type ProofOfWork = { prepare: () => Promise<PowProof>; ready: () => Promise<PowProof>; cancel: () => void }

export function createChallengeSolver(fetchChallenge: () => Promise<PowChallenge>, spawn: () => Worker, unsupportedMessage: string): ProofOfWork {
  let worker: Worker | null = null
  let pending: Promise<PowProof> | null = null
  function cancel() { worker?.terminate(); worker = null; pending = null }
  function prepare() {
    cancel()
    const started = Date.now()
    const job = (async () => {
      const challenge = await fetchChallenge()
      const nonce = await new Promise<string>((resolve, reject) => {
        const current = spawn(); worker = current
        current.onmessage = (event: MessageEvent<{ nonce: string | null }>) => {
          current.terminate(); if (worker === current) worker = null
          if (event.data.nonce) resolve(event.data.nonce); else reject(new Error('安全校验没有完成，请再试一次。'))
        }
        current.onerror = () => { current.terminate(); if (worker === current) worker = null; reject(new Error(unsupportedMessage)) }
        current.postMessage({ token: challenge.token, difficulty: challenge.difficulty })
      })
      const wait = challenge.minWaitMs - (Date.now() - started)
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
      return { challenge: challenge.token, nonce }
    })()
    pending = job
    job.catch(() => { if (pending === job) pending = null })
    return job
  }
  /** 拿到一份可用的校验；没有就现算一份。 */
  function ready() { return pending ?? prepare() }
  return { prepare, ready, cancel }
}
