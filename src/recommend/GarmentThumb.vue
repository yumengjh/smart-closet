<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { closetApi } from '../services/api'
import { thumbUrl } from '../services/urls'

/**
 * Small display image of one garment. Recommendations pass displayUrl; otherwise the garment's details are fetched
 * once and cached for the page session.
 */
const props = withDefaults(defineProps<{ garmentId: string; displayUrl?: string | null; alt?: string; size?: number }>(), { displayUrl: undefined, alt: '', size: 56 })
const cache: Map<string, Promise<string>> = ((globalThis as unknown as { __thumbCache?: Map<string, Promise<string>> }).__thumbCache ??= new Map())
const url = ref('')
async function load() {
  if (props.displayUrl !== undefined) { url.value = thumbUrl(props.displayUrl, props.size * 2) || ''; return }
  let p = cache.get(props.garmentId)
  if (!p) { p = closetApi.detail(props.garmentId).then(g => g.displayUrl || '').catch(() => ''); cache.set(props.garmentId, p) }
  url.value = thumbUrl(await p, props.size * 2) || ''
}
onMounted(load); watch(() => [props.garmentId, props.displayUrl], load)
</script>
<template>
  <span class="recommend-thumb" :style="{ width: `${size}px`, height: `${size}px` }"><img v-if="url" :src="url" :alt="alt" loading="lazy" decoding="async" /></span>
</template>
