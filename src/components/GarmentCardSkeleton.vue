<script setup lang="ts">
withDefaults(defineProps<{ count?: number; label?: string }>(), { count: 8, label: '正在加载衣物…' })
</script>

<template>
  <section class="garment-grid garment-skeleton-grid" role="status" :aria-label="label" aria-busy="true">
    <article v-for="index in count" :key="index" class="garment-card garment-card-skeleton" aria-hidden="true" :style="{ '--skeleton-delay': `${(index - 1) * 70}ms` }">
      <div class="card-image-wrap skeleton-image"></div>
      <a-skeleton active :title="{ width: '62%' }" :paragraph="{ rows: 1, width: '40%' }" class="skeleton-copy" />
    </article>
  </section>
</template>

<style scoped>
.garment-card-skeleton { cursor: default; animation: skeleton-rise .4s ease-out both; animation-delay: var(--skeleton-delay); }
.skeleton-image { position: relative; }
.skeleton-image::after { content: ''; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, color-mix(in srgb, var(--surface) 55%, transparent) 50%, transparent 70%); transform: translateX(-100%); animation: skeleton-shimmer 1.5s ease-in-out infinite; animation-delay: var(--skeleton-delay); }
.skeleton-copy.ant-skeleton { padding: 12px 2px 0; background: none; border-radius: 0; }
.skeleton-copy :deep(.ant-skeleton-title) { height: 14px; margin: 0; }
.skeleton-copy :deep(.ant-skeleton-paragraph) { margin-top: 10px !important; }
.skeleton-copy :deep(.ant-skeleton-paragraph > li) { height: 12px; }
@keyframes skeleton-shimmer { to { transform: translateX(100%); } }
@keyframes skeleton-rise { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { .garment-card-skeleton, .skeleton-image::after { animation: none; } }
</style>
