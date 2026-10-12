import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { closetApi, usingMocks, type ClosetTask } from '../services/api'
import { batchApi, type IntakeBatch } from '../services/batches'
import { batchEntry, renderEntry, taskEntry, type WaitingEntry } from '../domain/waiting'
import { platformRequest, type RenderJob } from '../services/platform'
import { playSound } from '../services/sound'

export const useProcessingStore = defineStore('processing', () => {
  const entries = ref<WaitingEntry[]>([])
  const latestNotice = ref<WaitingEntry | null>(null)
  const startPrompt = ref<WaitingEntry | null>(null)
  const connectionError = ref(false)
  const activeCount = computed(() => entries.value.filter(entry => entry.state === 'processing').length)
  const unreadCount = computed(() => entries.value.filter(entry => entry.state !== 'processing' && !entry.read).length)
  const ordered = computed(() => [...entries.value].sort((a, b) => Number(b.state === 'processing') - Number(a.state === 'processing') || b.startedAt - a.startedAt))
  let username = '', generation = 0, busy = false, discoveredAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const storageKey = () => `yuda.processing.v1:${username}`
  const invited = new Set<string>()
  function save() {
    if (username) try {
      sessionStorage.setItem(storageKey(), JSON.stringify(entries.value))
      sessionStorage.setItem(`${storageKey()}:invited`, JSON.stringify([...invited]))
    } catch { /* Optional session recovery. */ }
  }
  function receive(entry: WaitingEntry, submitted = false) {
    if (!username) return false
    const hadActive = activeCount.value > 0
    // Batch child workflows also occur in the single-item task API.
    if (entry.kind === 'task' && entries.value.some(batch => batch.kind === 'batch' && batch.childIds.includes(entry.id))) return false
    if (entry.kind === 'batch') {
      entries.value = entries.value.filter(item => item.kind !== 'task' || !entry.childIds.includes(item.id))
      if (latestNotice.value?.kind === 'task' && entry.childIds.includes(latestNotice.value.id)) latestNotice.value = null
      if (startPrompt.value?.kind === 'task' && entry.childIds.includes(startPrompt.value.id)) startPrompt.value = null
    }
    const index = entries.value.findIndex(item => item.key === entry.key)
    const previous = entries.value[index]
    if (!previous && !submitted && entry.state !== 'processing') return false
    // A page poll may return an older running snapshot after a global completion.
    // Single jobs do not restart under the same ID; batch rework has newer calls.
    if (!submitted && previous && previous.state !== 'processing' && entry.state === 'processing'
      && (entry.kind === 'task' || entry.startedAt <= previous.startedAt)) return false
    if (previous && entry.kind === 'batch' && entry.startedAt < previous.startedAt) return false
    if (previous && previous.state !== 'processing' && entry.state === 'processing') invited.delete(entry.key)
    entry.read = previous?.read ?? false
    if (entry.state === 'processing') { entry.read = false; if (latestNotice.value?.key === entry.key) latestNotice.value = null }
    if (entry.state !== 'processing' && (previous?.state === 'processing' || !previous && submitted)) {
      if (startPrompt.value?.key === entry.key) startPrompt.value = null
      latestNotice.value = entry
      playSound(entry.state === 'ready' ? 'complete' : entry.state === 'attention' ? 'error' : 'off')
    }
    if (index >= 0) entries.value[index] = entry
    else entries.value.push(entry)
    // Keep every running task; limit old completed entries kept in this tab.
    const finished = entries.value.filter(item => item.state !== 'processing').sort((a, b) => b.startedAt - a.startedAt).slice(0, 20)
    entries.value = [...entries.value.filter(item => item.state === 'processing'), ...finished]
    save()
    // Detail pages also report their own polls; those must not postpone the
    // global timer indefinitely. Only wake an idle monitor for a new job.
    if (!busy && !hadActive && activeCount.value) schedule()
    return true
  }
  function offerActivities(entry: WaitingEntry) {
    if (!username || entry.state !== 'processing' || entry.stage === '正在取消处理' || invited.has(entry.key)) return
    if (entry.kind === 'task' && entries.value.some(batch => batch.kind === 'batch' && batch.childIds.includes(entry.id))) return
    invited.add(entry.key); startPrompt.value = entry; save()
  }
  function trackTask(task: ClosetTask, submitted = false, offer = false) {
    const entry = taskEntry(task)
    if (receive(entry, submitted) && (submitted || offer)) offerActivities(entry)
  }
  function trackBatch(batch: IntakeBatch, submitted = false, offer = false) {
    const entry = batchEntry(batch)
    if (receive(entry, submitted) && (submitted || offer)) offerActivities(entry)
  }
  /** Image generation runs about a minute; the send-off animation hands it to this centre instead of a page spinner. */
  function trackRender(job: RenderJob, submitted = false) { receive(renderEntry(job), submitted) }
  /** Rehearsal of the whole hand-off for the OOTD page's preview button: nothing is sent and no quota is used. */
  function simulateRender(thumb?: string, seconds = 8) {
    const id = `demo-${Date.now()}`, startedAt = Date.now()
    const base: WaitingEntry = { key: `render:${id}`, kind: 'render', id, title: 'OOTD 穿搭图 · 模拟演示', startedAt, state: 'processing', stage: '正在上身绘制', note: '模拟演示，不消耗额度', href: '/ootd', read: false, childIds: [] }
    receive(base, true)
    setTimeout(() => receive({ ...base, state: 'ready', stage: '穿搭图好了，去看看', note: '模拟演示，未真正生成', thumb }), seconds * 1000)
  }
  const renderJobs = () => usingMocks ? Promise.resolve([] as RenderJob[]) : platformRequest<RenderJob[]>('/api/me/image-render-jobs')
  function dismissStartPrompt() { startPrompt.value = null }
  function dismissNotice() { latestNotice.value = null }
  function viewed(entry: WaitingEntry) {
    const item = entries.value.find(item => item.key === entry.key)
    if (item && item.state !== 'processing') item.read = true
    if (latestNotice.value?.key === entry.key) latestNotice.value = null
    save()
  }
  async function refresh(discover = false) {
    if (!username || busy || document.hidden) return
    busy = true
    const epoch = generation
    try {
      let failed = false
      if (discover || Date.now() - discoveredAt > 30_000) {
        const results = await Promise.allSettled([closetApi.tasks(), usingMocks ? Promise.resolve([] as IntakeBatch[]) : batchApi.history(), renderJobs()])
        if (generation !== epoch) return
        const [tasks, batches, renders] = results
        if (renders.status === 'fulfilled') renders.value.forEach(job => trackRender(job))
        const children = new Set(batches.status === 'fulfilled' ? batches.value.flatMap(batch => batch.targets.flatMap(target => target.jobId ? [target.jobId] : [])) : [])
        if (batches.status === 'fulfilled') batches.value.forEach(batch => trackBatch(batch))
        else failed = true
        // If batch discovery failed, defer newly discovered single tasks to avoid duplicate child notices.
        if (tasks.status === 'fulfilled') tasks.value.filter(task => !children.has(task.id)).forEach(task => {
          if (batches.status === 'fulfilled' || entries.value.some(entry => entry.key === `task:${task.id}`)) trackTask(task)
        })
        else failed = true
        discoveredAt = failed ? 0 : Date.now()
      }
      const active = entries.value.filter(entry => entry.state === 'processing' && entry.kind !== 'render')
      const rendering = entries.value.filter(entry => entry.state === 'processing' && entry.kind === 'render' && !entry.id.startsWith('demo-'))
      const [results, renders] = await Promise.all([
        Promise.allSettled(active.map(async entry => ({ entry, value: entry.kind === 'task' ? taskEntry(await closetApi.task(entry.id)) : batchEntry(await batchApi.get(entry.id)) }))),
        rendering.length ? renderJobs().then(list => list, () => null) : Promise.resolve([] as RenderJob[]),
      ])
      if (generation !== epoch) return
      if (renders) {
        // One list call covers every running picture; a job deleted elsewhere simply leaves the centre.
        const byId = new Map(renders.map(job => [job.id, job]))
        rendering.forEach(entry => { const job = byId.get(entry.id); if (job) trackRender(job); else { entries.value = entries.value.filter(item => item.key !== entry.key); save() } })
      } else failed = true
      for (const result of results) {
        if (result.status === 'fulfilled') receive(result.value.value)
        else failed = true
      }
      connectionError.value = failed
    } finally {
      if (generation === epoch) { busy = false; schedule() }
    }
  }
  function schedule() {
    clearTimeout(timer)
    if (username && !document.hidden) timer = setTimeout(() => { void refresh() }, connectionError.value ? 10_000 : activeCount.value ? 4_000 : 30_000)
  }
  function visibility() { clearTimeout(timer); if (!document.hidden) void refresh(true) }
  function stop() {
    save(); generation++; username = ''; busy = false; discoveredAt = 0
    clearTimeout(timer); document.removeEventListener('visibilitychange', visibility)
    entries.value = []; latestNotice.value = null; startPrompt.value = null; invited.clear(); connectionError.value = false
  }
  function start(user: string) {
    if (username === user) return
    stop(); username = user
    try {
      const saved: WaitingEntry[] = JSON.parse(sessionStorage.getItem(storageKey()) || '[]')
      if (Array.isArray(saved)) entries.value = saved.filter(entry => entry && ['task', 'batch', 'render'].includes(entry.kind) && typeof entry.id === 'string' && entry.key === `${entry.kind}:${entry.id}` && Array.isArray(entry.childIds) && !(entry.id.startsWith('demo-') && entry.state === 'processing'))
      const hints: unknown = JSON.parse(sessionStorage.getItem(`${storageKey()}:invited`) || '[]')
      if (Array.isArray(hints)) for (const key of hints) if (typeof key === 'string') invited.add(key)
    } catch { /* A fresh tab discovers active jobs from the server. */ }
    document.addEventListener('visibilitychange', visibility)
    void refresh(true)
  }
  return { entries, ordered, latestNotice, startPrompt, activeCount, unreadCount, connectionError, start, stop, refresh, trackTask, trackBatch, trackRender, simulateRender, dismissStartPrompt, dismissNotice, viewed }
})
