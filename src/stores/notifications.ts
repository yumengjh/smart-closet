import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { notificationApi, type ClosetNotification } from '../notifications/api'

/**
 * Notifications for the processing centre: refreshed every minute while the page is visible and whenever the panel opens.
 * Right after a garment enters the closet a duplicate notice is likely within seconds (issue #14), so for two minutes
 * after {@link expectSoon} the refresh runs every 5 seconds.
 */
export const useNotificationStore = defineStore('notifications', () => {
  const items = ref<ClosetNotification[]>([])
  const unread = ref(0)
  const error = ref(false)
  const latest = ref<ClosetNotification | null>(null)
  const unreadItems = computed(() => items.value.filter(item => !item.read))
  let timer: ReturnType<typeof setInterval> | undefined
  let fast: ReturnType<typeof setInterval> | undefined
  let fastUntil = 0
  let seen = new Set<string>()
  let started = false

  async function refresh() {
    try {
      const list = await notificationApi.list()
      // Something new since the last refresh (not the first load) pops up once as a toast.
      if (started) latest.value = list.items.find(item => !item.read && !seen.has(item.id)) ?? latest.value
      seen = new Set(list.items.map(item => item.id))
      items.value = list.items; unread.value = list.unread; error.value = false; started = true
    } catch { error.value = true }
  }
  async function read(item: ClosetNotification) {
    if (item.read) return
    item.read = true; unread.value = Math.max(0, unread.value - 1)
    try { unread.value = (await notificationApi.read(item.id)).unread } catch { /* The next refresh corrects the count. */ }
  }
  async function readAll() {
    items.value.forEach(item => { item.read = true }); unread.value = 0
    try { unread.value = (await notificationApi.readAll()).unread } catch { /* The next refresh corrects the count. */ }
  }
  /** Deleting hides the notice on the server; the same event never notifies again. */
  async function remove(item: ClosetNotification) {
    items.value = items.value.filter(other => other.id !== item.id)
    if (!item.read) unread.value = Math.max(0, unread.value - 1)
    if (latest.value?.id === item.id) latest.value = null
    try { unread.value = (await notificationApi.remove(item.id)).unread } catch { void refresh() }
  }
  async function removeAll() {
    items.value = []; unread.value = 0; latest.value = null
    try { unread.value = (await notificationApi.removeAll()).unread } catch { void refresh() }
  }
  function start() {
    if (timer) return
    void refresh()
    timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60_000)
  }
  /** A garment just entered the closet: look for its duplicate notice every 5 s for the next two minutes. */
  function expectSoon(ms = 120_000) {
    if (!timer) return
    fastUntil = Math.max(fastUntil, Date.now() + ms)
    if (fast) return
    fast = setInterval(() => {
      if (Date.now() > fastUntil) { clearInterval(fast); fast = undefined; return }
      if (document.visibilityState === 'visible') void refresh()
    }, 5_000)
  }
  function stop() { clearInterval(fast); fast = undefined; fastUntil = 0; clearInterval(timer); timer = undefined; started = false; items.value = []; unread.value = 0; seen = new Set(); latest.value = null }
  function dismissLatest() { latest.value = null }
  return { items, unread, error, latest, unreadItems, refresh, read, readAll, remove, removeAll, start, stop, dismissLatest, expectSoon }
})
