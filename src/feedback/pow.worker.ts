// 在 Worker 里算反馈的工作量证明，不卡页面；主线程用 terminate() 取消。
import { solve } from './pow'

self.onmessage = (event: MessageEvent<{ token: string; difficulty: number }>) => {
  const { token, difficulty } = event.data
  const nonce = solve(token, difficulty)
  self.postMessage({ token, nonce })
}
