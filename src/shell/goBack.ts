import type { Router } from 'vue-router'

/**
 * 左上角“返回”（体验改版，2026-11-23）：从哪来回哪去。vue-router 把同一应用里的来路记在 history.state.back；
 * 有来路就退回去（例如从通知点进衣物详情，返回回到原来的穿搭收藏），直接打开、刷新或新标签页没有来路时才去兜底页。
 */
export function goBack(router: Router, fallback: string) {
  const state = typeof window === 'undefined' ? null : window.history.state as { back?: string | null } | null
  if (state?.back) router.back()
  else void router.push(fallback)
}
