<script setup lang="ts">
// GB 45438-2025 显式标识：AI 生成图的角标。放进 position: relative 的图片容器，默认落在右下角。
defineProps<{ small?: boolean }>()
</script>

<template>
  <a-tag class="ai-badge" :class="{ small }" :bordered="false" aria-label="AI 生成" title="AI 生成内容，请勿去除标识">AI 生成</a-tag>
</template>

<style scoped>
.ai-badge { position: absolute; right: 6px; bottom: 6px; z-index: 2; margin: 0; padding: 0 6px; border-radius: 10px; background: rgba(20, 20, 24, 0.68); color: #fff; font-size: 11px; line-height: 18px; pointer-events: none; user-select: none; }
.ai-badge.small { right: 3px; bottom: 3px; padding: 0 4px; font-size: 10px; line-height: 15px; }
</style>
