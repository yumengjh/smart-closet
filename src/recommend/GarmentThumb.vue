<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { closetApi } from '../services/api'
import { mediaUrl } from '../services/urls'

/** Small display image of one garment; details are cached for the page session. */
const props = withDefaults(defineProps<{ garmentId: string; alt?: string; size?: number }>(), { alt: '', size: 56 })
const cache: Map<string, Promise<string>> = ((globalThis as unknown as { __thumbCache?: Map<string, Promise<string>> }).__thumbCache ??= new Map())
const url = ref('')
async function load() {
  let p = cache.get(props.garmentId)
  if (!p) { p = closetApi.detail(props.garmentId).then(g => (g.displayUrl ? mediaUrl(g.displayUrl) : '') || '').catch(() => ''); cache.set(props.garmentId, p) }
  url.value = (await p) || ''
}
onMounted(load); watch(() => props.garmentId, load)
</script>
<template>
  <span class="recommend-thumb" :style="{ width: `${size}px`, height: `${size}px` }"><img v-if="url" :src="url" :alt="alt" loading="lazy" /></span>
</template>
