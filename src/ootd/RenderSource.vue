<script setup lang="ts">
// What an OOTD picture was made from (issue #106): outfit, garments, model, pose and time. Thumbnails come from the
// outfits already loaded on the page; records made before #106 show whatever their summary still has.
import { computed } from 'vue'
import type { RenderJob } from '../services/platform'
import { thumbUrl } from '../services/urls'
import { describeAdjustments } from './body-adjust'

const props = defineProps<{ job: RenderJob; thumbs: Map<string, string>; compact?: boolean }>()
const s = computed(() => props.job.summary)
const items = computed(() => (s.value?.items || []).map(i => ({ ...i, image: props.thumbs.get(i.garmentId) })))
const time = computed(() => new Date(props.job.createdAt).toLocaleString('zh-CN', { hour12: false }))
</script>

<template>
  <dl class="render-source" :class="{ compact }">
    <template v-if="s?.kind === 'ADJUST'"><dt>来源</dt><dd>身材调整：{{ describeAdjustments(s.adjustments) }}（原图保留）</dd></template>
    <template v-if="s?.outfit"><dt>搭配</dt><dd>{{ s.outfit }}</dd></template>
    <template v-if="items.length">
      <dt>衣物</dt>
      <dd class="render-source-items">
        <span v-for="i in items" :key="i.garmentId" class="render-source-item" :title="i.label">
          <img v-if="i.image" :src="thumbUrl(i.image, 120)" alt="" loading="lazy" /><span>{{ i.label }}</span>
        </span>
      </dd>
    </template>
    <template v-if="s?.model"><dt>模特</dt><dd>{{ s.model }}</dd></template>
    <template v-if="s?.pose"><dt>动作</dt><dd>{{ s.pose }}<small v-if="s.poseText && !compact" class="render-source-pose">{{ s.poseText }}</small></dd></template>
    <dt>生成于</dt><dd>{{ time }}</dd>
    <template v-if="s?.retryOf && !compact"><dt>说明</dt><dd>这是一次重新生成</dd></template>
  </dl>
</template>

<style scoped>
.render-source { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 12px; margin: 0; font-size: 13px; line-height: 1.6; }
.render-source dt { color: var(--muted-copy); white-space: nowrap; }
.render-source dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.render-source.compact { gap: 2px 8px; font-size: 12px; }
.render-source-items { display: flex; flex-wrap: wrap; gap: 6px; }
.render-source-item { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 2px 8px 2px 2px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-alt); }
.render-source-item img { flex-shrink: 0; width: 28px; height: 28px; border-radius: 6px; object-fit: contain; background: var(--surface); }
.render-source-item > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compact .render-source-item img { width: 22px; height: 22px; }
.render-source-pose { display: block; color: var(--muted-subtle); font-size: 12px; }
</style>
