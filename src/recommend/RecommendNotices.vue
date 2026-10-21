<script setup lang="ts">
import { ref } from 'vue'
import { DownOutlined, InfoCircleOutlined } from '@ant-design/icons-vue'

/** Limits and notes of one recommendation run as a quiet one-liner that expands, instead of a full-width alert. */
const props = defineProps<{ items: string[] }>()
const open = ref(false)
</script>
<template>
  <div v-if="props.items.length" class="recommend-notices" :class="{ open }">
    <a-button type="text" size="small" class="recommend-notices-toggle" :aria-expanded="open" @click="open = !open">
      <InfoCircleOutlined /><span class="recommend-notices-first">{{ open ? '本次说明' : props.items[0] }}</span>
      <span v-if="props.items.length > 1 && !open" class="recommend-notices-count">等 {{ props.items.length }} 条</span><DownOutlined class="recommend-notices-caret" />
    </a-button>
    <ul v-if="open"><li v-for="n in props.items" :key="n">{{ n }}</li></ul>
  </div>
</template>
<style scoped>
.recommend-notices { min-width: 0; }
.recommend-notices-toggle.ant-btn { display: flex; align-items: center; gap: 6px; max-width: 100%; height: auto; min-height: 28px; padding: 2px 6px; margin-left: -6px; font-size: 12px; color: var(--muted); text-align: left; }
.recommend-notices-first { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recommend-notices-count { flex: none; color: var(--muted-subtle); }
.recommend-notices-caret { flex: none; font-size: 10px; transition: transform .18s ease; }
.open .recommend-notices-caret { transform: rotate(180deg); }
.recommend-notices ul { margin: 2px 0 0; padding-left: 18px; display: grid; gap: 2px; font-size: 12px; line-height: 1.7; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .recommend-notices-caret { transition: none; } }
</style>
