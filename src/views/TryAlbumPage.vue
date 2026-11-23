<script setup lang="ts">
// “我的图”（/try/album，试穿与创作合并 server#271 3.2）：上身图（/api/ootd/jobs 全量）与作品（分页）按时间混排，
// 可按来源筛选。上身图沿用 groupRecords（#106）的进行中、失败与“已重试成功”分组，作品沿用 workState。
// 操作按来源：上身图有重新生成、身材调整、用了什么、删除；作品有保存、分享、再试一次、删除。拍摄记录仍在实时试穿里。
// ?job= 打开那张图；还没有图的打开它的状态。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, EllipsisOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import PageTitle from '../shell/PageTitle.vue'
import AiBadge from '../components/AiBadge.vue'
import CreationViewer from '../components/creation/CreationViewer.vue'
import ResultViewer from '../ootd/ResultViewer.vue'
import RenderSource from '../ootd/RenderSource.vue'
import { adviceFor, failureReason, routeTarget } from '../ootd/jobStatus'
import { recordLine, recordTitle, useOotdRecords } from '../ootd/useOotdRecords'
import { creationApi } from '../creation/api'
import { creationCatalog, loadCreationCatalog } from '../creation/access'
import { liveCreation } from '../creation/model'
import { OUTFIT_EFFECT_ID, workState } from '../creation/steps'
import { refreshWorks, watchWorks, workJobs, worksError, worksLoaded, workTotal } from '../creation/works'
import type { CreationJob } from '../creation/types'
import { albumTiles, mergeWorks, workBucket, type AlbumFilter } from '../try/album'
import { TRY_PATH } from '../try/routes'
import { goBack } from '../shell/goBack'
import { mediaUrl } from '../services/urls'

const route = useRoute(), router = useRouter(), { message, modal } = App.useApp()
const records = useOotdRecords()
const filter = ref<AlbumFilter>('all')
const opened = ref<CreationJob | null>(null)
const older = ref<CreationJob[]>([]), olderPage = ref(1), loadingOlder = ref(false)
const describe = (cause: unknown) => cause instanceof Error ? cause.message : '暂时未能完成，请稍后重试。'
const when = (ms: number) => new Date(ms).toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const works = computed(() => mergeWorks(workJobs.value, older.value))
const showFilter = computed(() => Boolean(creationCatalog.value?.enabled) || works.value.length > 0)
const done = computed(() => albumTiles(records.groups.done, works.value.filter(job => workBucket(job) === 'done'), filter.value))
const running = computed(() => albumTiles(records.groups.running, works.value.filter(job => workBucket(job) === 'running'), filter.value))
const failedWorks = computed(() => filter.value === 'ootd' ? [] : works.value.filter(job => workBucket(job) === 'failed'))
const failedOotd = computed(() => filter.value === 'work' ? [] : records.groups.failed)
const replacedOotd = computed(() => filter.value === 'work' ? [] : records.groups.replaced)
const failedCount = computed(() => failedOotd.value.length + failedWorks.value.length)
const moreWorks = computed(() => filter.value !== 'ootd' && works.value.length < workTotal.value)
const loaded = computed(() => !records.loading && (worksLoaded.value || !!worksError.value))
const failedOpen = ref<string[]>([])

/** 作品按页加载：第一页由 works 共享状态保持最新，更早的页在这里累加。 */
async function loadOlder() {
  if (loadingOlder.value) return
  loadingOlder.value = true
  try { const page = await creationApi.jobs(olderPage.value + 1); older.value = mergeWorks(older.value, page.items); olderPage.value = page.page }
  catch (cause) { message.error(describe(cause)) } finally { loadingOlder.value = false }
}
function refreshAll() { void records.refresh(); void refreshWorks(1) }
function dropWork(id: string) { older.value = older.value.filter(job => job.id !== id) }

// 查看器删除作品时先关闭再通知变化，所以另记一下打开的是哪一条，好从“更早的作品”里去掉。
let openedId = ''
function openWork(job: CreationJob) { if (job.status === 'SUCCEEDED' && job.mediaUrl) { opened.value = job; openedId = job.id } }
// 再试一次沿用现有语义：带 parentJobId 回到“做张图”，衣服取草稿里当前的，会用 1 次。
function again(job: CreationJob) { message.info('再试一次会用 1 次'); void router.push({ path: TRY_PATH, query: { again: job.id, template: job.templateId } }) }
function cancelWork(job: CreationJob) { modal.confirm({ title: '取消这次创作？', content: '已发送给图片服务的尝试仍会用掉 1 次。', okText: '取消创作', cancelText: '继续等待', async onOk() { try { await creationApi.cancel(job.id); await refreshWorks(1) } catch (cause) { message.error(describe(cause)) } } }) }
function removeWork(job: CreationJob) { modal.confirm({ title: '删除这条作品？', content: '正在创作的会先取消，删除后无法再查看。', okText: '删除', okType: 'danger', cancelText: '保留', async onOk() { try { await creationApi.remove(job.id); dropWork(job.id); await refreshWorks(1) } catch (cause) { message.error(describe(cause)) } } }) }
function workChanged() { if (!opened.value && openedId) dropWork(openedId); void refreshWorks(1) }

// 从整理中心或旧地址 /ootd?job= 进来时打开那一条；只打开一次，随后去掉参数，免得刷新时又弹出来。
function openFromRoute() {
  const id = typeof route.query.job === 'string' ? route.query.job : ''
  if (!id) return
  const work = works.value.find(job => job.id === id)
  if (work) {
    if (workBucket(work) === 'done') openWork(work)
    else { const s = workState(work); message.info([s.label, s.detail].filter(Boolean).join('：')) }
  } else {
    const target = routeTarget(id, records.jobs, loaded.value)
    if (target.action === 'wait') return
    if (target.action === 'view') records.viewing = target.job!
    else if (target.action === 'status') records.statusId = target.job!.id
    else message.info('这条生成记录已经不存在，可能已被删除。')
  }
  const { job: _job, ...query } = route.query
  void router.replace({ query })
}
watch([() => route.query.job, () => records.jobs, works, loaded], openFromRoute)

let stop: (() => void) | undefined
onMounted(() => { void loadCreationCatalog(true).catch(() => { /* 作品仍可查看。 */ }); void refreshWorks(1); stop = watchWorks() })
onUnmounted(() => stop?.())
</script>

<template>
  <PageTitle title="我的图" :count="done.length || null" unit="张" />
  <div class="al">
    <header class="al-head">
      <a-button type="text" shape="circle" aria-label="返回" @click="goBack(router, TRY_PATH)"><ArrowLeftOutlined /></a-button>
      <a-segmented v-if="showFilter" v-model:value="filter" class="al-filter" :options="[{ value: 'all', label: '全部' }, { value: 'ootd', label: '上身图' }, { value: 'work', label: '作品' }]" aria-label="按来源筛选" />
      <span v-else class="al-filter" />
      <a-button type="text" shape="circle" aria-label="刷新" @click="refreshAll"><ReloadOutlined /></a-button>
    </header>
    <a-alert v-if="records.error" type="warning" :message="records.error" show-icon class="al-alert"><template #action><a-button size="small" @click="records.load()">重试</a-button></template></a-alert>
    <a-alert v-if="worksError && filter !== 'ootd'" type="warning" :message="worksError" show-icon class="al-alert"><template #action><a-button size="small" @click="refreshWorks(1)">重试</a-button></template></a-alert>
    <a-skeleton v-if="!loaded && !done.length" active :paragraph="{ rows: 6 }" />

    <a-collapse v-if="failedCount || replacedOotd.length" v-model:active-key="failedOpen" ghost class="al-failed">
      <a-collapse-panel key="failed" :header="failedCount ? `${failedCount} 张没有生成成功` : `已重新生成成功的失败记录 ${replacedOotd.length} 条`">
        <article v-for="job in failedOotd" :key="job.id" class="al-row">
          <a-tag class="al-row-tag" :bordered="false" :color="adviceFor(job).tone === 'warning' ? 'warning' : adviceFor(job).tone === 'failed' ? 'error' : 'default'">{{ adviceFor(job).label }}</a-tag>
          <div class="al-row-body"><p class="al-title">上身图 · {{ recordTitle(job) }}</p><p class="al-reason">{{ failureReason(job) }}</p><RenderSource :job="job" :thumbs="records.thumbs" compact /></div>
          <div class="al-row-actions">
            <a-tag v-if="records.groups.retryState.get(job.id) === 'retrying'" :bordered="false" color="processing">正在重新生成</a-tag>
            <a-button v-else-if="adviceFor(job).canRetry" size="small" type="primary" :loading="records.retrying === job.id" @click="records.retry(job)">重新生成</a-button>
            <a-button size="small" @click="records.openJob(job)">详情</a-button>
            <a-button v-if="adviceFor(job).canDelete" size="small" danger @click="records.remove(job)">删除</a-button>
          </div>
        </article>
        <article v-for="job in failedWorks" :key="job.id" class="al-row">
          <a-tag class="al-row-tag" :bordered="false" :color="workState(job).tone === 'unsure' ? 'warning' : workState(job).tone === 'failed' ? 'error' : 'default'">{{ workState(job).label }}</a-tag>
          <div class="al-row-body"><p class="al-title">{{ job.templateName }}</p><p class="al-reason" :class="{ muted: workState(job).tone !== 'failed' }">{{ workState(job).detail || when(job.createdAtMs) }}</p></div>
          <div class="al-row-actions">
            <a-button v-if="job.status === 'FAILED' || job.status === 'UNKNOWN'" size="small" type="primary" @click="again(job)">再试一次</a-button>
            <a-button size="small" danger @click="removeWork(job)">删除</a-button>
          </div>
        </article>
        <article v-for="job in replacedOotd" :key="job.id" class="al-row">
          <a-tag class="al-row-tag" :bordered="false" color="success">已重试成功</a-tag>
          <div class="al-row-body"><p class="al-title">上身图 · {{ recordTitle(job) }}</p><p class="al-reason muted">{{ failureReason(job) }} · {{ recordLine(job) }}</p></div>
          <div class="al-row-actions"><a-button size="small" @click="records.viewReplacement(job)">查看新图</a-button><a-button v-if="adviceFor(job).canDelete" size="small" danger @click="records.remove(job)">删除</a-button></div>
        </article>
      </a-collapse-panel>
    </a-collapse>

    <div v-if="running.length || done.length" class="al-grid" role="status" aria-live="polite">
      <article v-for="tile in running" :key="`${tile.kind}:${tile.id}`" class="al-card running">
        <div class="al-media"><span class="al-running"><b>{{ tile.kind === 'ootd' ? adviceFor(tile.job).label : workState(tile.job).label }}</b><small>{{ tile.kind === 'work' && workState(tile.job).tone === 'idle' ? workState(tile.job).detail : '做好会提醒你' }}</small></span></div>
        <div class="al-body">
          <template v-if="tile.kind === 'ootd'">
            <p class="al-title">{{ recordTitle(tile.job) }}</p>
            <a-button v-if="adviceFor(tile.job).canCancel" type="link" size="small" class="al-link" @click="records.cancel(tile.job)">取消</a-button>
          </template>
          <template v-else>
            <p class="al-title">{{ tile.job.templateName }}</p>
            <a-button v-if="tile.job.canCancel && liveCreation(tile.job)" type="link" size="small" class="al-link" @click="cancelWork(tile.job)">取消</a-button>
          </template>
        </div>
      </article>
      <article v-for="tile in done" :key="`${tile.kind}:${tile.id}`" class="al-card">
        <template v-if="tile.kind === 'ootd'">
          <button type="button" class="al-media" aria-label="查看大图" @click="records.openJob(tile.job)">
            <img :src="mediaUrl(tile.job.mediaUrl!)" alt="上身图（AI 生成）" loading="lazy" /><AiBadge />
            <span v-if="tile.job.summary?.kind === 'ADJUST'" class="al-flag">身材调整</span>
          </button>
          <div class="al-body">
            <p class="al-title" :title="recordTitle(tile.job)">{{ recordTitle(tile.job) }}</p>
            <p class="al-line">上身图 · {{ recordLine(tile.job) }}</p>
            <a-popover trigger="click" placement="top" title="生成时用的资料" :overlay-style="{ maxWidth: '320px' }">
              <template #content><RenderSource :job="tile.job" :thumbs="records.thumbs" /></template>
              <a-button type="link" size="small" class="al-link">用了什么</a-button>
            </a-popover>
          </div>
        </template>
        <template v-else>
          <button type="button" class="al-media" :aria-label="`查看${tile.job.templateName}`" @click="openWork(tile.job)">
            <img :src="mediaUrl(tile.job.mediaUrl!)" :alt="`${tile.job.templateName}（AI 生成）`" loading="lazy" /><AiBadge />
          </button>
          <div class="al-body al-body-row">
            <div><p class="al-title">{{ tile.job.templateName }}</p><p class="al-line">作品 · {{ when(tile.job.createdAtMs) }}</p></div>
            <a-dropdown :trigger="['click']" placement="bottomRight"><a-button type="text" size="small" shape="circle" aria-label="更多"><EllipsisOutlined /></a-button>
              <template #overlay><a-menu :items="[{ key: 'again', label: '再试一次' }, { key: 'delete', label: '删除', danger: true }]" @click="({ key }: { key: string | number }) => key === 'again' ? again(tile.job) : removeWork(tile.job)" /></template>
            </a-dropdown>
          </div>
        </template>
      </article>
    </div>
    <div v-else-if="loaded && !failedCount && !replacedOotd.length" class="al-empty">
      <p>{{ filter === 'work' ? '做好的作品会放在这里。' : filter === 'ootd' ? '生成的上身图会放在这里。' : '做好的上身图和作品会放在这里。' }}</p>
      <a-button type="primary" @click="router.push(filter === 'ootd' ? { path: TRY_PATH, query: { template: OUTFIT_EFFECT_ID } } : TRY_PATH)">去做一张</a-button>
    </div>
    <div v-if="moreWorks" class="al-more"><a-button :loading="loadingOlder" @click="loadOlder">看更早的作品</a-button></div>
  </div>

  <a-modal :open="!!records.statusJob" :title="records.advice?.title" :footer="null" width="420px" @cancel="records.statusId = ''">
    <template v-if="records.statusJob && records.advice">
      <a-alert :type="records.advice.tone === 'failed' ? 'error' : records.advice.tone === 'warning' ? 'warning' : 'info'" show-icon :message="records.advice.label" :description="records.advice.body || undefined" class="al-status-alert" />
      <a-alert v-if="records.groups.retryState.get(records.statusJob.id) === 'replaced'" type="success" show-icon message="已经重新生成成功，新图在图片列表里。" class="al-status-alert" />
      <a-alert v-else-if="records.groups.retryState.get(records.statusJob.id) === 'retrying'" type="info" show-icon message="已经在重新生成，做好后这条会自动收起。" class="al-status-alert" />
      <RenderSource :job="records.statusJob" :thumbs="records.thumbs" class="al-status-facts" />
      <a-space wrap>
        <a-button v-if="records.groups.retryState.get(records.statusJob.id) === 'replaced'" type="primary" @click="records.viewReplacement(records.statusJob)">查看新图</a-button>
        <a-button v-else-if="records.advice.canRetry && records.groups.retryState.get(records.statusJob.id) !== 'retrying'" type="primary" :loading="records.retrying === records.statusJob.id" @click="records.retry(records.statusJob)">重新生成</a-button>
        <a-button v-if="records.advice.canCancel" @click="records.cancel(records.statusJob)">取消生成</a-button>
        <a-button v-if="records.advice.canDelete" danger @click="() => { const job = records.statusJob!; records.statusId = ''; records.remove(job) }">删除这条记录</a-button>
        <a-button @click="records.statusId = ''">关闭</a-button>
      </a-space>
    </template>
  </a-modal>
  <ResultViewer :job="records.viewingJob" :thumbs="records.thumbs" :can-adjust="!!records.available.length" @close="records.viewing = null" @changed="records.refresh()" @submitted="records.adjusted" @remove="records.remove" />
  <CreationViewer :job="opened" @close="opened = null" @changed="workChanged" />
</template>

<style scoped>
.al { max-width: 1080px; margin: 0 auto; }
.al-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.al-head > .ant-btn:first-child { margin-left: -8px; }
.al-head > .ant-btn:last-child { margin-right: -8px; }
.al-filter { flex: 1; min-width: 0; max-width: 320px; margin: 0 auto; }
.al-alert { margin-bottom: 12px; }
.al-failed { margin-bottom: 12px; border-radius: 14px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.al-failed :deep(.ant-collapse-header) { color: var(--muted-strong); font-size: 14px; }
.al-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 12px; padding: 10px 0; border-top: 1px solid var(--line); }
.al-row:first-of-type { border-top: 0; }
.al-row-tag { flex-shrink: 0; margin: 2px 0 0; }
.al-row-body { display: flex; flex: 1 1 240px; flex-direction: column; gap: 4px; min-width: 0; }
.al-row-body .al-title { white-space: normal; font-weight: 600; }
.al-reason { margin: 0; color: var(--danger); font-size: 12px; }
.al-reason.muted { color: var(--muted-subtle); }
.al-row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
.al-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.al-card { display: flex; flex-direction: column; min-width: 0; overflow: hidden; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.al-media { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 3 / 4; padding: 0; overflow: hidden; border: 0; background: var(--surface-alt); cursor: zoom-in; }
.al-media:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
.al-card.running .al-media { cursor: default; }
.al-media img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform .25s ease; }
.al-media:hover img { transform: scale(1.02); }
.al-running { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 12px; color: var(--muted-strong); text-align: center; background: linear-gradient(110deg, var(--surface-alt) 30%, var(--surface) 50%, var(--surface-alt) 70%); background-size: 220% 100%; animation: al-shine 1.6s linear infinite; }
.al-running b { font-size: 13px; font-weight: 600; }
.al-running small { font-size: 12px; color: var(--muted); }
@keyframes al-shine { to { background-position: -220% 0; } }
.al-flag { position: absolute; top: 8px; left: 8px; padding: 0 8px; border-radius: 6px; background: #111111cc; color: #fff; font-size: 11px; line-height: 20px; }
.al-body { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; padding: 8px 10px 10px; }
.al-body-row { flex-direction: row; align-items: flex-start; justify-content: space-between; gap: 4px; }
.al-body-row > div { min-width: 0; }
.al-title { margin: 0; overflow: hidden; font-size: 13px; font-weight: 500; color: var(--ink); text-overflow: ellipsis; white-space: nowrap; }
.al-line { margin: 0; overflow: hidden; font-size: 12px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.al-link { align-self: flex-start; height: auto; padding: 0; font-size: 12px; }
.al-empty { display: grid; justify-items: center; gap: 12px; padding: 40px 16px; border-radius: 16px; background: var(--surface-alt); color: var(--muted); font-size: 14px; text-align: center; }
.al-empty p { margin: 0; }
.al-more { margin-top: 20px; text-align: center; }
.al-status-alert { margin-bottom: 14px; white-space: pre-line; }
.al-status-facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 16px; font-size: 13px; }
@media (min-width: 768px) { .al-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; } }
@media (min-width: 1024px) { .al-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .al-running { animation: none; } .al-media img { transition: none; } }
</style>
