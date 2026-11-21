// 穿前检查的时机（server 设计 2026-11-21 4.1）：进入“谁来穿”立刻查一次，之后任意改动 300ms 防抖重查。
// 检查免费、零模型调用；只保留最后一次请求的结果，界面不显示大块加载。上身图（useOotdStudio）、
// 需要人物的创作效果（scene 方式）和搭配编辑器的“穿搭检查”共用。
import { onScopeDispose, ref, watch } from 'vue'
import { platformRequest, type Review } from '../services/platform'

export const WEAR_CHECK_DELAY = 300

/** body 为 null 表示现在没有可查的衣服；active 为 false 时不查（离开这一步）。 */
export function useWearCheck(body: () => Record<string, unknown> | null, active: () => boolean) {
  const review = ref<Review | null>(null), checking = ref(false), error = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined, seq = 0

  /** 立刻查一次（生成前也用它），返回这次的结果；被更新的请求取代时仍返回自己的结果，但不写进 review。 */
  async function run(): Promise<Review | null> {
    clearTimeout(timer)
    const payload = body()
    const mine = ++seq
    if (!payload) { review.value = null; checking.value = false; error.value = ''; return null }
    checking.value = true
    try {
      const result = await platformRequest<Review>('/api/outfit-reviews', 'POST', payload)
      if (mine === seq) { review.value = result; error.value = '' }
      return result
    } catch (cause) {
      if (mine === seq) error.value = cause instanceof Error ? cause.message : String(cause)
      throw cause
    } finally { if (mine === seq) checking.value = false }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { void run().catch(() => { /* 小状态里显示“暂时没查到”，生成时会再查。 */ }) }, WEAR_CHECK_DELAY) }
  function reset() { clearTimeout(timer); seq++; review.value = null; checking.value = false; error.value = '' }

  // 没有可查的衣服或不在这一步时 key 为空；从空变为有内容（刚进入、衣服刚加载好）立刻查，之后的改动防抖。
  watch(() => { if (!active()) return ''; const payload = body(); return payload ? JSON.stringify(payload) : '' }, (key, old) => {
    if (!key) { clearTimeout(timer); return }
    if (!old) void run().catch(() => {}) // 刚进入这一步：立刻查
    else schedule()
  }, { immediate: true })
  onScopeDispose(() => clearTimeout(timer))

  return { review, checking, error, run, reset }
}
