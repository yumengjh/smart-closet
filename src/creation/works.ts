// 我的作品的共享状态：创作页的小点、作品页和试穿入口读同一份；轮询只在有进行中作品时进行。
import { computed, ref } from 'vue'
import { mayPoll, onAccountChange } from '../domain/accountSession'
import { celebrate } from '../services/celebrate'
import { creationApi } from './api'
import { liveCreation } from './model'
import { liveCount, newlyDone } from './steps'
import type { CreationJob } from './types'

export const workJobs = ref<CreationJob[]>([])
export const workTotal = ref(0)
export const workPage = ref(1)
export const worksError = ref('')
export const worksLoaded = ref(false)
export const worksLoading = ref(false)
export const liveWorks = computed(() => liveCount(workJobs.value))
const seen = new Map<string, string>(), celebrated = new Set<string>()
let epoch = 0, timer: ReturnType<typeof setInterval> | undefined, users = 0
onAccountChange(() => { epoch++; workJobs.value = []; workTotal.value = 0; workPage.value = 1; worksError.value = ''; worksLoaded.value = false; seen.clear(); celebrated.clear() })

export async function refreshWorks(page = workPage.value) {
  if (worksLoading.value || !mayPoll()) return
  const mine = epoch
  worksLoading.value = true
  try {
    const result = await creationApi.jobs(page)
    if (mine !== epoch) return
    workJobs.value = result.items; workTotal.value = result.total; workPage.value = page; worksError.value = ''; worksLoaded.value = true
    // 第一页之外看不到最新作品，不据此判断“刚完成”。
    if (page === 1 && newlyDone(seen, result.items, celebrated).length) void celebrate('milestone')
  } catch (cause) { if (mine === epoch) worksError.value = cause instanceof Error ? cause.message : '暂时未能加载，请稍后重试。' }
  finally { worksLoading.value = false }
}
/** 提交成功后把新作品放到最前面，同时记下它处于进行中。 */
export function addWork(job: CreationJob) {
  workJobs.value = [job, ...workJobs.value.filter(item => item.id !== job.id)]
  workTotal.value = Math.max(workTotal.value, workJobs.value.length)
  if (workPage.value === 1) seen.set(job.id, job.status)
}
/** 页面挂载时调用，返回停止函数；有进行中或待确认的作品时每 5 秒刷新一次。 */
export function watchWorks(): () => void {
  users++
  if (!timer) timer = setInterval(() => { if (!document.hidden && mayPoll() && workJobs.value.some(job => liveCreation(job) || job.status === 'UNKNOWN')) void refreshWorks() }, 5000)
  let stopped = false
  return () => { if (stopped) return; stopped = true; if (--users <= 0) { users = 0; clearInterval(timer); timer = undefined } }
}
