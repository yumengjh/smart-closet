<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { closetApi } from '../services/api'
import { thumbUrl } from '../services/urls'

/** Small display image of one garment; details are cached for the page session. */
const props = withDefaults(defineProps<{ garmentId: string; alt?: string; size?: number }>(), { alt: '', size: 56 })
const cache: Map<string, Promise<string>> = ((globalThis as unknown as { __thumbCache?: Map<string, Promise<string>> }).__thumbCache ??= new Map())
const url = ref('')
async function load() {
  let p = cache.get(props.garmentId)
  if (!p) { p = closetApi.detail(props.garmentId).then(g => g.displayUrl || '').catch(() => ''); cache.set(props.garmentId, p) }
  url.value = thumbUrl(await p, props.size * 2) || ''
}
onMounted(load); watch(() => props.garmentId, load)
</script>
<template>
  <span class="recommend-thumb" :style="{ width: `${size}px`, height: `${size}px` }"><img v-if="url" :src="url" :alt="alt" loading="lazy" decoding="async" /></span>
</template>
