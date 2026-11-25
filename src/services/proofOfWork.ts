// 计算工作量证明的 Worker（意见反馈与邮箱验证码共用）；取题与等待的逻辑在 domain/proofOfWork.ts。
export function spawnPowWorker() { return new Worker(new URL('../feedback/pow.worker.ts', import.meta.url), { type: 'module' }) }
