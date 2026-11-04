<script setup lang="ts">
// 页面标题（清新改版 §2）：标题和计数放进顶栏 logo 旁边的 #topbar-page；页面里只留一个读屏用的 h1。
// 说明文字不再占页面顶部，放进标题旁的“？”提示（hint）。
import { QuestionCircleOutlined } from '@ant-design/icons-vue'
defineProps<{ title: string; count?: number | string | null; unit?: string; hint?: string }>()
</script>
<template>
  <Teleport defer to="#topbar-page">
    <span class="page-title-chip">
      <b>{{ title }}</b>
      <template v-if="count !== undefined && count !== null"><em>{{ count }}</em><small v-if="unit">{{ unit }}</small></template>
      <a-tooltip v-if="hint" :title="hint" placement="bottomLeft"><QuestionCircleOutlined class="page-title-hint" tabindex="0" :aria-label="hint" /></a-tooltip>
    </span>
  </Teleport>
  <h1 class="page-title-sr">{{ title }}</h1>
</template>
<style scoped>
.page-title-chip { display: flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; }
.page-title-chip b { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 15px; font-weight: 500; color: var(--ink); }
.page-title-chip em, .page-title-chip small { flex: none; }
.page-title-chip em { margin-left: 4px; font-style: normal; font-size: 15px; font-weight: 600; color: var(--accent-strong); font-variant-numeric: tabular-nums; }
.page-title-chip small { font-size: 12px; color: var(--muted); }
.page-title-hint { margin-left: 4px; font-size: 13px; color: var(--muted-subtle); cursor: help; }
.page-title-hint:hover, .page-title-hint:focus-visible { color: var(--accent-strong); }
.page-title-sr { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 767px) { .page-title-chip b, .page-title-chip em { font-size: 14px; } .page-title-hint { display: none; } }
</style>
