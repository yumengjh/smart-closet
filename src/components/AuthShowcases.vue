<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { platformRequest } from '../services/platform'
import { publicShowcases, type PublicShowcase } from '../creation/showcases'

const emit = defineEmits<{ available: [value: boolean] }>()
const items = ref<PublicShowcase[]>([])
const loaded = ref(new Set<string>())
const available = computed(() => items.value.some(item => loaded.value.has(item.id)))
watch(available, value => emit('available', value), { flush: 'sync' })
let alive = true, loading = false, refreshTimer: ReturnType<typeof setInterval> | undefined
let lastAttempt = 0
async function refresh() {
  if (!alive || loading || document.visibilityState === 'hidden' || Date.now() - lastAttempt < 60000) return
  loading = true
  lastAttempt = Date.now()
  try {
    const response = await platformRequest<unknown>('/api/public/creations/showcases', 'GET', undefined, undefined, { anonymous: true, timeoutMs: 5000 })
    if (alive) items.value = publicShowcases(response).slice(0, 2)
  } catch { if (alive) items.value = [] }
  finally { loading = false }
}
function ready(id: string) { loaded.value = new Set([...loaded.value, id]) }
function failed(id: string) {
  items.value = items.value.filter(item => item.id !== id)
  loaded.value.delete(id)
}
function visibleAgain() { if (document.visibilityState !== 'hidden') void refresh() }
onMounted(() => {
  void refresh()
  // Refresh publication state while this public page remains open, without reloading or interrupting the form.
  refreshTimer = setInterval(refresh, 60000)
  document.addEventListener('visibilitychange', visibleAgain)
  window.addEventListener('focus', visibleAgain)
})
onBeforeUnmount(() => {
  alive = false
  clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', visibleAgain)
  window.removeEventListener('focus', visibleAgain)
})
</script>

<template>
  <section v-show="available" class="auth-showcases" aria-label="官方精选">
    <h2>穿搭的另一种记录</h2>
    <div class="showcase-gallery">
      <figure v-for="item in items" :key="item.id" class="showcase-item" :class="{ 'is-loaded': loaded.has(item.id) }">
        <img :src="item.imageUrl" :alt="item.title" decoding="async" referrerpolicy="no-referrer" @load="ready(item.id)" @error="failed(item.id)" />
        <figcaption>
          <div class="showcase-heading"><strong>{{ item.title }}</strong><a-tag>AI生成</a-tag></div>
          <p v-if="item.description">{{ item.description }}</p>
        </figcaption>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.auth-showcases { width: 100%; margin: auto 0; }
.auth-showcases h2 { margin: 0 0 var(--space-4); font-size: 22px; line-height: 1.4; }
.showcase-gallery { display: flex; gap: var(--space-4); align-items: flex-start; }
.showcase-item { flex: 1; min-width: 0; margin: 0; }
.showcase-item:not(.is-loaded) { display: none !important; }
.showcase-item img { display: block; width: 100%; aspect-ratio: 3 / 4; max-height: 46vh; object-fit: contain; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.showcase-item figcaption { padding-top: var(--space-3); }
.showcase-heading { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.showcase-heading strong { font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.showcase-heading :deep(.ant-tag) { flex: none; margin: 0; color: var(--muted-strong); border-color: var(--line); background: var(--surface); }
.showcase-item p { margin: var(--space-1) 0 0; color: var(--muted-copy); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
@media (max-width: 767px) {
  .auth-showcases { margin: var(--space-2) 0 0; }
  .auth-showcases h2 { display: none; }
  .showcase-item { display: flex; gap: var(--space-3); align-items: center; }
  .showcase-item.is-loaded ~ .showcase-item.is-loaded { display: none; }
  .showcase-item img { flex: none; width: 92px; height: 120px; }
  .showcase-item figcaption { min-width: 0; padding: 0; }
  .showcase-item p { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
}
</style>
