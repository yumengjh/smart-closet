// 上身图记录（原 OotdPage 下半部分，server#271 移到“我的图”）：全量列表、5 秒刷新、失败分组（#106）、
// 状态说明、取消、删除、重新生成（每条一个幂等键）与身材调整后的交接。
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { App } from 'ant-design-vue'
import { useBillingStore } from '../billing/store'
import { closetApi } from '../services/api'
import { platformRequest, type Capability, type RenderJob } from '../services/platform'
import type { Outfit } from '../domain/outfit'
import { createUuid } from '../domain/id'
import { describeAdjustments } from './body-adjust'
import { adviceFor, groupRecords } from './jobStatus'
import { offerImagePurchase } from './useOotdStudio'
import { useProcessingStore } from '../stores/processing'
import { useSendOffStore } from '../stores/sendOff'

export function recordTitle(job: RenderJob) { return job.summary?.kind === 'ADJUST' ? `身材调整 · ${describeAdjustments(job.summary.adjustments)}` : job.summary?.outfit || [job.summary?.model, job.summary?.pose].filter(Boolean).join(' · ') || '未记录来源' }
export function recordLine(job: RenderJob) { return [job.summary?.kind !== 'ADJUST' && job.summary?.outfit ? [job.summary?.model, job.summary?.pose].filter(Boolean).join(' · ') : '', new Date(job.createdAt).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ') }

export function useOotdRecords() {
  const billing = useBillingStore(), { message, modal } = App.useApp(), processing = useProcessingStore(), sendOff = useSendOffStore()
  const jobs = ref<RenderJob[]>([]), outfits = ref<Outfit[]>([]), capabilities = ref<Capability[]>([])
  const loading = ref(true), error = ref('')
  const viewing = ref<RenderJob | null>(null), statusId = ref(''), retrying = ref('')
  const retryKeys = new Map<string, string>()
  // Issue #106: pictures, running jobs and failures are shown apart; a failure replaced by a successful retry folds away.
  const groups = computed(() => groupRecords(jobs.value))
  const available = computed(() => capabilities.value.filter(c => c.verified && c.purpose === 'OOTD'))
  const thumbs = computed(() => { const out = new Map<string, string>(); for (const o of outfits.value) for (const e of o.scene.elements) if (e.garmentId && e.assetUrl && !out.has(e.garmentId)) out.set(e.garmentId, e.assetUrl); return out })
  const viewingJob = computed(() => viewing.value && (jobs.value.find(j => j.id === viewing.value!.id) || viewing.value))
  const statusJob = computed(() => jobs.value.find(j => j.id === statusId.value) || null)
  const advice = computed(() => statusJob.value ? adviceFor(statusJob.value) : null)

  async function load() {
    const [j, o, c] = await Promise.allSettled([platformRequest<RenderJob[]>('/api/ootd/jobs'), closetApi.outfits(), platformRequest<Capability[]>('/api/render-capabilities')])
    if (j.status === 'fulfilled') { jobs.value = j.value; error.value = '' } else error.value = j.reason instanceof Error ? j.reason.message : String(j.reason)
    if (o.status === 'fulfilled') outfits.value = o.value
    if (c.status === 'fulfilled') capabilities.value = c.value
    loading.value = false
  }
  async function refresh() { if (document.hidden) return; try { jobs.value = await platformRequest('/api/ootd/jobs'); error.value = '' } catch { /* Next poll retries. */ } }
  function viewReplacement(job: RenderJob) { const next = jobs.value.find(j => j.id === groups.value.replacedBy.get(job.id)); statusId.value = ''; if (next) viewing.value = next }
  function openJob(job: RenderJob) { if (job.mediaUrl) viewing.value = job; else statusId.value = job.id }
  async function cancel(job: RenderJob) { try { await platformRequest(`/api/ootd/jobs/${job.id}/cancel`, 'POST', {}); await refresh(); message.info('已请求停止；无法保证上游停止或退还额度。') } catch (e) { message.error(String(e)) } }
  function remove(job: RenderJob) {
    modal.confirm({ title: '永久删除这张图？', content: '删除后无法恢复；搭配、形象和其他图片不受影响。', okText: '删除', okType: 'danger', cancelText: '取消', async onOk() { await platformRequest(`/api/ootd/jobs/${job.id}`, 'DELETE'); viewing.value = null; await refresh() } })
  }
  async function accepted(created: RenderJob, source: RenderJob) {
    const cards = (source.summary?.items || []).map(item => ({ image: thumbs.value.get(item.garmentId), label: item.label }))
    sendOff.launch({ title: `重新生成 · ${recordTitle(source)}`, cards })
    processing.trackRender(created, true)
    jobs.value = [created, ...jobs.value.filter(j => j.id !== created.id)]
    await Promise.all([refresh(), billing.refresh()])
  }
  function retry(job: RenderJob) {
    if (groups.value.retryState.get(job.id) !== 'open') { message.info(groups.value.retryState.get(job.id) === 'retrying' ? '这条已经在重新生成，请稍等。' : '这条已经重新生成成功了。'); return }
    modal.confirm({
      title: '重新生成这张图？', okText: '重新生成（1 个额度）', cancelText: '先不了',
      content: job.status === 'UNKNOWN' ? '上一次请求可能已经在服务商那边出图并扣了额度，重新生成会再用 1 个图像额度。' : '会按原来的搭配、形象和动作再生成一张，再用 1 个图像额度。',
      async onOk() {
        // One key per job until it is accepted, so a double click or a retried request never submits twice.
        const retryKey = retryKeys.get(job.id) || createUuid(); retryKeys.set(job.id, retryKey); retrying.value = job.id
        try { const created = await platformRequest<RenderJob>(`/api/ootd/jobs/${job.id}/retry`, 'POST', {}, retryKey); retryKeys.delete(job.id); statusId.value = ''; await accepted(created, job) }
        catch (e) { if (!await offerImagePurchase(billing, e)) { message.error(e instanceof Error ? e.message : String(e)); throw e } }
        finally { retrying.value = '' }
      },
    })
  }
  async function adjusted(job: RenderJob) {
    const source = viewingJob.value
    sendOff.launch({ title: `身材调整 · ${describeAdjustments(job.summary?.adjustments)}（原图保留）`, cards: source?.mediaUrl ? [{ image: source.mediaUrl, label: '原图' }] : [] })
    processing.trackRender(job, true); viewing.value = null; jobs.value = [job, ...jobs.value.filter(j => j.id !== job.id)]; await refresh()
  }

  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => { void load(); timer = setInterval(refresh, 5000) })
  onUnmounted(() => clearInterval(timer))

  return reactive({
    jobs, outfits, loading, error, viewing, statusId, retrying, groups, available, thumbs, viewingJob, statusJob, advice,
    load, refresh, viewReplacement, openJob, cancel, remove, retry, adjusted,
  })
}
export type OotdRecords = ReturnType<typeof useOotdRecords>
