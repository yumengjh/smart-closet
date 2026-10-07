<script setup lang="ts">
import { mediaUrl } from '../services/urls'
import { computed } from 'vue'
import { targetPreviewSource } from '../domain/intake'
import type { BatchTarget, BatchSource } from '../services/batches'
const props=defineProps<{target:BatchTarget;source?:BatchSource;processed?:boolean}>()
const preview=computed(()=>targetPreviewSource(props.target,props.source,props.processed))
const crop=computed(()=>{
  const b=props.target.recognition.target.bounds
  return {width:`${100/b.width}%`,height:`${100/b.height}%`,left:`${-100*b.x/b.width}%`,top:`${-100*b.y/b.height}%`}
})
</script>
<template><span class="target-preview"><img v-if="preview.url" :src="mediaUrl(preview.url)" :style="preview.cropped?crop:undefined" :class="{processed:!preview.cropped}" :alt="target.recognition.target.description" /></span></template>
<style scoped>.target-preview{position:relative;display:block;flex:none;width:64px;height:64px;overflow:hidden;border-radius:var(--radius-sm);background:var(--surface-soft)}.target-preview img{position:absolute;max-width:none;object-fit:fill}.target-preview img.processed{position:static;width:100%;height:100%;object-fit:contain}</style>
