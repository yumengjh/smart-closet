<script setup lang="ts">
import { computed } from 'vue'
import type { BatchTarget, BatchSource } from '../services/batches'
const props=defineProps<{target:BatchTarget;source?:BatchSource}>()
const crop=computed(()=>{
  const b=props.target.recognition.target.bounds
  return {width:`${100/b.width}%`,height:`${100/b.height}%`,left:`${-100*b.x/b.width}%`,top:`${-100*b.y/b.height}%`}
})
</script>
<template><span class="target-preview"><img v-if="source" :src="source.previewUrl" :style="crop" :alt="target.recognition.target.description" /></span></template>
<style scoped>.target-preview{position:relative;display:block;flex:none;width:64px;height:64px;overflow:hidden;border-radius:8px;background:var(--surface-soft)}.target-preview img{position:absolute;max-width:none;object-fit:fill}</style>
