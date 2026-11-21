<script setup lang="ts">
// 上身图“更多”（server 设计 2026-11-21 4.3）：穿法细节（塞法、袖子、门襟）、补充说明、生成模型（多于一个时）、
// 模拟一次、管理我的形象。姿势单独一行（PoseRow），这次穿哪些与哪件穿里面改在部位清单（PartList）里，不再有多层开关与“只检查”。
import { DETAIL_OPTIONS, type OotdStudio } from './useOotdStudio'

defineProps<{ studio: OotdStudio }>()
</script>

<template>
  <div class="ootd-more">
    <template v-if="studio.current">
      <template v-if="studio.detailGarments.length">
        <p class="ootd-more-label">穿法细节 <small>只影响这张图，不改搭配</small></p>
        <div v-for="g in studio.detailGarments" :key="g.garmentId" class="ootd-more-detail">
          <span>{{ g.garmentLabel }}<a-tag v-if="studio.suggested[g.garmentId]" :bordered="false">建议</a-tag></span>
          <a-select v-for="d in DETAIL_OPTIONS[g.role]" :key="d.key" size="small" class="ootd-more-select" :aria-label="`${g.garmentLabel}${d.label}`" :value="studio.detail(g.garmentId, d.key)" :options="d.options.map(o => ({ value: o.value, label: `${d.label}：${o.label}` }))" @update:value="(v: string) => studio.setDetail(g.garmentId, d.key, v)" />
        </div>
      </template>
      <a-textarea v-model:value="studio.wearNote" :maxlength="200" show-count :auto-size="{ minRows: 1, maxRows: 3 }" placeholder="补充说明，例如：衬衫领口解开一颗扣子" aria-label="穿法补充说明" />
    </template>
    <template v-if="studio.available.length > 1"><p class="ootd-more-label">生成模型</p><a-select v-model:value="studio.model" class="ootd-more-full" aria-label="生成模型" :options="studio.available.map(c => ({ value: c.provider + ':' + c.model, label: c.model }))" /></template>
    <div class="ootd-more-actions">
      <a-button size="small" @click="studio.moreAction('rehearse')">模拟一次（不用次数）</a-button>
      <a-button size="small" type="text" @click="studio.moreAction('manage')">管理我的形象</a-button>
    </div>
  </div>
</template>

<style scoped>
.ootd-more { display: grid; gap: 10px; }
.ootd-more-label { margin: 6px 0 0; font-size: 13px; font-weight: 600; }
.ootd-more-label small { margin-left: 6px; font-weight: 400; color: var(--muted); }
.ootd-more-detail { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.ootd-more-detail > span { flex: 1 1 100%; font-size: 13px; }
.ootd-more-select { min-width: 132px; }
.ootd-more-full { width: 100%; }
.ootd-more-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
</style>
