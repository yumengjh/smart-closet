<script setup lang="ts">
import { CheckOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons-vue'
import type { Baseline } from '../services/platform'
import { mediaUrl } from '../services/urls'
import AiBadge from '../components/AiBadge.vue'
import { modelLabel } from './labels'

defineProps<{ models: Baseline[]; modelValue: string }>()
defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <div class="model-strip" role="radiogroup" aria-label="选择模特">
    <button v-for="b in models" :key="b.id" type="button" role="radio" class="model-option" :class="{ selected: modelValue === b.id }" :aria-checked="modelValue === b.id" @click="$emit('update:modelValue', b.id)">
      <span class="model-photo"><img v-if="b.mediaUrl" :src="mediaUrl(b.mediaUrl)" :alt="modelLabel(b)" loading="lazy" /><UserOutlined v-else /><AiBadge v-if="b.mediaUrl" small /></span>
      <span class="model-name">{{ modelLabel(b) }}</span>
      <span v-if="b.currentDefault" class="model-default">默认</span>
      <span v-if="modelValue === b.id" class="model-check"><CheckOutlined /></span>
    </button>
    <RouterLink to="/settings?section=personal" class="model-option model-add"><PlusOutlined /><span class="model-name">新模特</span></RouterLink>
  </div>
</template>

<style scoped>
.model-strip { display: flex; gap: var(--space-3); overflow-x: auto; padding: 2px 2px var(--space-2); scroll-snap-type: x proximity; }
.model-option { position: relative; display: flex; flex: 0 0 96px; flex-direction: column; align-items: stretch; gap: 6px; padding: 0; border: 0; background: none; color: var(--ink); cursor: pointer; scroll-snap-align: start; text-align: center; }
.model-photo { position: relative; display: grid; place-items: center; height: 128px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-alt); color: var(--muted-subtle); font-size: 24px; transition: box-shadow .15s ease, border-color .15s ease; }
.model-photo img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.model-option.selected .model-photo { border-color: var(--ink); box-shadow: 0 0 0 2px var(--ink); }
.model-option:focus-visible .model-photo { outline: 2px solid var(--accent); outline-offset: 2px; }
.model-name { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.model-default { position: absolute; top: 6px; left: 6px; padding: 0 6px; border-radius: 999px; background: #ffffffd9; color: #3a3d45; font-size: 11px; line-height: 18px; }
.model-check { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--action-bg); color: var(--action-fg); font-size: 11px; }
.model-add .model-photo, .model-add { color: var(--muted-copy); }
.model-add { justify-content: flex-start; }
.model-add > .anticon { display: grid; place-items: center; height: 128px; border: 1px dashed var(--line); border-radius: var(--radius-md); font-size: 20px; }
</style>
