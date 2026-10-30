import { useNotificationStore } from './notifications'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { closetApi, usingMocks } from '../services/api'
import { canUseCloset, type SessionUser } from '../domain/session'
import { AccountSwitchedError, connectAccountTransport, markAccountStale, setActiveAccount } from '../domain/accountSession'

export const useClosetStore = defineStore('closet', () => {
  const user = ref<SessionUser | null>(null)
  const loadingUser = ref(false)
  let userInitialized = false
  let userRequest: Promise<void> | null = null
  const taskCount = ref(0)
  const pendingCount = ref(0)
  const isSignedIn = computed(() => Boolean(user.value))
  // Every place that signs in or out assigns `user`; the account epoch and the other tabs follow from this one watcher (smart-closet-server#159, #160).
  connectAccountTransport()
  watch(user, current => setActiveAccount(current?.username ?? null), { immediate: true, flush: 'sync' })

  function refreshUser() {
    if (userRequest) return userRequest
    userRequest = (async () => {
      loadingUser.value = true
      try { user.value = await closetApi.currentUser() }
      catch (cause) { if (!(cause instanceof AccountSwitchedError)) user.value = null }
      finally { loadingUser.value = false; userInitialized = true; userRequest = null }
    })()
    return userRequest
  }
  /** Compare the session cookie's account with the one this page shows (a tab that missed the broadcast, or woke from sleep). */
  async function verifyAccount() {
    if (!user.value || usingMocks) return
    try {
      const current = await closetApi.currentUser()
      if (current && user.value && current.username !== user.value.username) markAccountStale()
    } catch { /* Offline, signed out or already stale: nothing to compare. */ }
  }
  async function ensureUser() { if (!userInitialized) await refreshUser() }
  async function refreshCounts() {
    if (!canUseCloset(user.value)) { taskCount.value = 0; pendingCount.value = 0; return }
    const requestedUser = user.value?.username
    try {
      const [tasks, pending] = await Promise.all([
        closetApi.tasks(),
        closetApi.list({ status: 'DRAFT', q: '', category: '', color: '', season: '', page: 1, size: 1 }),
      ])
      if (user.value?.username !== requestedUser) return
      taskCount.value = tasks.filter((task) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(task.status)).length
      // Fewer garments waiting for review usually means one just entered the closet: its duplicate check follows shortly.
      if (pending.total < pendingCount.value) useNotificationStore().expectSoon()
      pendingCount.value = pending.total
    } catch { /* Keep the last known counts until the next successful response. */ }
  }
  async function signOut() {
    await closetApi.logout()
    clearSession()
  }
  function clearSession() {
    user.value = null
    taskCount.value = 0
    pendingCount.value = 0
    for (const key of Object.keys(localStorage)) if (key === 'closetWorkflow' || key === 'yixu.mock-first-login') localStorage.removeItem(key)
  }
  return { user, loadingUser, isSignedIn, taskCount, pendingCount, refreshUser, ensureUser, verifyAccount, refreshCounts, signOut, clearSession, usingMocks }
})
