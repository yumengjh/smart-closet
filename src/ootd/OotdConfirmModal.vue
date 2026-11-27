<script setup lang="ts">
// 生成上身图前的确认（原上身图页，server#271 拆出）：谁来穿、姿势、衣物、穿法与消耗。
import { mediaUrl } from '../services/urls'
import AiBadge from '../components/AiBadge.vue'
import { modelLabel } from './labels'
import type { OotdStudio } from './useOotdStudio'

defineProps<{ studio: OotdStudio }>()
</script>

<template>
  <a-modal v-model:open="studio.confirmOpen" title="生成这张上身图？" ok-text="生成" cancel-text="再想想" :confirm-loading="studio.busy" width="440px" @ok="studio.generate()">
    <template v-if="studio.preparation">
      <a-alert v-if="studio.error" type="error" :message="studio.error" show-icon role="status" aria-live="polite" style="margin-bottom:12px" />
      <div class="confirm-summary">
        <span v-if="studio.person?.mediaUrl" class="confirm-photo"><img :src="mediaUrl(studio.person.mediaUrl)" :alt="studio.person ? modelLabel(studio.person) : '形象'" /><AiBadge small /></span>
        <dl>
          <dt>谁来穿</dt><dd>{{ studio.person ? modelLabel(studio.person) : '' }}</dd>
          <dt>姿势</dt><dd>{{ studio.preparation.pose?.name || '自动' }}</dd>
          <dt>衣物</dt><dd>{{ studio.preparation.review.items.map(i => i.label).join('、') }}</dd>
          <template v-if="studio.wearSummary"><dt>穿法</dt><dd>{{ studio.wearSummary }}</dd></template>
          <dt>消耗</dt><dd>{{ studio.preparation.quotaUnits }} {{ studio.renderTiers?.enabled ? '次' : '次图像额度' }}</dd>
        </dl>
      </div>
      <a-alert v-for="issue in studio.preparation.review.warnings" :key="issue.code" type="warning" :message="issue.message" style="margin-top:8px" />
      <p class="confirm-note">这是 AI 生成的效果预览，不代表真实尺码是否合身。</p>
    </template>
  </a-modal>
</template>

<style scoped>
.confirm-summary { display: flex; gap: 16px; align-items: flex-start; }
.confirm-photo { position: relative; flex-shrink: 0; display: block; width: 84px; height: 126px; }
.confirm-summary img { flex-shrink: 0; width: 84px; height: 126px; border-radius: 10px; object-fit: cover; object-position: top; background: var(--surface-alt); }
.confirm-summary dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
.confirm-summary dt { color: var(--muted-copy); }
.confirm-summary dd { margin: 0; overflow-wrap: anywhere; }
.confirm-note { margin: 12px 0 0; font-size: 13px; line-height: 1.7; color: var(--muted-copy); }
</style>
