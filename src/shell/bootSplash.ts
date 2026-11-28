// 启动画面（index.html 里的 #boot，「衣柜吐不停」）：脚本加载前就由纯 CSS 播放，
// 应用第一次显示真正的页面（登录页或已登录的主界面）时淡出并移除。不设最短展示时间。
export const BOOT_SPLASH_ID = 'boot'
export const BOOT_SPLASH_FADE_MS = 260

type SplashDocument = Pick<Document, 'getElementById'>
type SplashWindow = { matchMedia?: (query: string) => { matches: boolean }, setTimeout: (handler: () => void, ms: number) => unknown }

export function dismissBootSplash(doc: SplashDocument = document, win: SplashWindow = window): void {
  const el = doc.getElementById(BOOT_SPLASH_ID)
  if (!el || el.dataset.leaving) return
  el.dataset.leaving = '1'
  if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { el.remove(); return }
  el.classList.add('yb-out')
  win.setTimeout(() => el.remove(), BOOT_SPLASH_FADE_MS)
}
