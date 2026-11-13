import { defineStore } from 'pinia'
import { ref } from 'vue'
import { billingApi } from './api'
import type { Quote } from './model'

export const useBillingStore = defineStore('billing', () => {
  const image = ref<Quote>()
  const realtime = ref<Quote>()
  const error = ref('')
  const loading = ref(false)
  const purchase = ref<'' | 'image' | 'tryon'>('')
  let generation = 0
  let pending: Promise<void> | undefined
  function reset() {
    generation++
    pending = undefined
    image.value = undefined
    realtime.value = undefined
    purchase.value = ''
    error.value = ''
    loading.value = false
  }
  function refresh() {
    if (pending) return pending
    const current = generation
    loading.value = true
    pending = (async () => {
      const results = await Promise.allSettled([billingApi.quote('image.standard'), billingApi.quote('tryon.realtime')])
      if (current !== generation) return
      const [i, r] = results
      if (i.status === 'fulfilled') image.value = i.value
      if (r.status === 'fulfilled') realtime.value = r.value
      error.value = results.some(result => result.status === 'rejected') ? '点数与次数暂时无法刷新，请重试。' : ''
      if (i.status === 'fulfilled' && !i.value.enabled) {
        image.value = { enabled: false }
        realtime.value = { enabled: false }
        purchase.value = ''
      }
    })().finally(() => { if (current === generation) { pending = undefined; loading.value = false } })
    return pending
  }
  return { image, realtime, error, loading, purchase, reset, refresh }
})
