<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { DeleteOutlined, DownloadOutlined, MessageOutlined, ColumnWidthOutlined } from '@ant-design/icons-vue'
import { platformRequest, PlatformRequestError, type BodyAdjustments, type RenderJob, type RenderSubmission } from '../services/platform'
import { mediaUrl } from '../services/urls'
import { createUuid } from '../domain/id'
import { BODY_DIMENSIONS, describeAdjustments } from './body-adjust'
import AiBadge from '../components/AiBadge.vue'

const props = defineProps<{ job: RenderJob | null; canAdjust: boolean }>()
const emit = defineEmits<{ close: []; changed: []; submitted: [RenderJob]; remove: [RenderJob] }>()
const { message } = App.useApp()
const adjusting = ref(false); const values = ref<Required<BodyAdjustments>>({ build: 0, shoulders: 0, waist: 0, hips: 0, legs: 0 })
const busy = ref(false); const key = ref(createUuid()); const notice = ref('')
const feedbackOpen = ref(false); const feedback = ref('')
const touched = computed(() => Object.values(values.value).some(v => v !== 0))
const summary = computed(() => describeAdjustments(values.value))
watch(() => props.job?.id, () => { adjusting.value = false; reset(); notice.value = '' })
function reset() { values.value = { build: 0, shoulders: 0, waist: 0, hips: 0, legs: 0 }; key.value = createUuid() }
function marks(less: string, more: string) { return { '-2': less, 0: '不变', 2: more } }

async function submit() {
  const job = props.job
  if (!job || !touched.value || busy.value) return
  busy.value = true; notice.value = ''
  try {
    const created = await platformRequest<RenderJob>(`/api/ootd/jobs/${job.id}/adjustments`, 'POST', values.value, key.value, { timeoutMs: 60000 })
    done(created)
  } catch (e) {
    if (e instanceof PlatformRequestError && e.uncertain) {
      try {
        const original = await platformRequest<RenderSubmission>(`/api/me/image-render-submissions/${encodeURIComponent(key.value)}`, 'GET', undefined, undefined, { timeoutMs: 10000 })
        if (original.found && original.job) { done(original.job); return }
        notice.value = '暂未查到这次调整。再点一次会复用原提交编号，不会重复生成。'
      } catch { notice.value = '连接仍未恢复，暂时无法确认是否已提交。请稍后在生成记录里查看。' }
    } else notice.value = e instanceof Error ? e.message : String(e)
  } finally { busy.value = false }
}
function done(created: RenderJob) { adjusting.value = false; reset(); emit('submitted', created) }
function openFeedback() { feedback.value = props.job?.feedback || ''; feedbackOpen.value = true }
async function saveFeedback() {
  if (!props.job) return
  try { await platformRequest(`/api/ootd/jobs/${props.job.id}/feedback`, 'PUT', { content: feedback.value }); feedbackOpen.value = false; emit('changed'); message.success('反馈已保存。') }
  catch (e) { message.error(String(e)) }
}
</script>

<template>
  <a-modal :open="!!job" :footer="null" width="min(920px, 96vw)" class="result-viewer" :title="null" @cancel="emit('close')">
    <div v-if="job" class="viewer">
      <div class="viewer-media"><span v-if="job.mediaUrl" class="viewer-frame"><img :src="mediaUrl(job.mediaUrl)" alt="OOTD 生成结果大图（AI 生成）" /><AiBadge /></span></div>
      <div class="viewer-side">
        <div class="viewer-meta">
          <a-tag v-if="job.summary?.kind === 'ADJUST'" color="purple">身材调整</a-tag>
          <a-tag v-if="job.summary?.model">{{ job.summary.model }}</a-tag>
          <a-tag v-if="job.summary?.pose">动作 · {{ job.summary.pose }}</a-tag>
          <span>{{ new Date(job.createdAt).toLocaleString() }}</span>
        </div>
        <p v-if="job.summary?.adjustments" class="viewer-note">{{ describeAdjustments(job.summary.adjustments) }}</p>

        <template v-if="!adjusting">
          <div class="viewer-actions">
            <a-button v-if="canAdjust" type="primary" block @click="adjusting = true"><ColumnWidthOutlined /> 调节身材</a-button>
            <a-button v-if="job.mediaUrl" block :href="mediaUrl(job.mediaUrl) + '?download=1'" :download="`ootd-${job.id.slice(0, 8)}.png`"><DownloadOutlined /> 保存图片</a-button>
            <div class="viewer-row">
              <a-button block @click="openFeedback"><MessageOutlined /> 反馈</a-button>
              <a-button block danger @click="emit('remove', job)"><DeleteOutlined /> 删除</a-button>
            </div>
          </div>
          <p v-if="job.feedback" class="viewer-note">我的反馈：{{ job.feedback }}</p>
        </template>

        <div v-else class="adjust-panel">
          <h3>调节身材</h3>
          <div v-for="d in BODY_DIMENSIONS" :key="d.key" class="adjust-row">
            <span>{{ d.label }}</span>
            <a-slider v-model:value="values[d.key]" :min="-2" :max="2" :step="1" :marks="marks(d.less, d.more)" :tooltip-open="false" :included="false" :aria-label="d.label" />
          </div>
          <p class="viewer-note">{{ touched ? summary : '拖动滑块选择要调整的部位' }}</p>
          <a-alert v-if="notice" type="warning" :message="notice" show-icon />
          <p class="viewer-cost">生成一张新图，用 1 个图像额度；原图保留。</p>
          <div class="viewer-row">
            <a-button block :disabled="busy" @click="adjusting = false; reset()">取消</a-button>
            <a-button block type="primary" :disabled="!touched" :loading="busy" @click="submit">生成</a-button>
          </div>
        </div>
      </div>
    </div>
  </a-modal>
  <a-modal v-model:open="feedbackOpen" title="反馈这张图" ok-text="保存" cancel-text="取消" @ok="saveFeedback">
    <a-textarea v-model:value="feedback" :maxlength="1000" :auto-size="{ minRows: 3, maxRows: 8 }" placeholder="人物不像、衣服不对、花纹变了……" />
  </a-modal>
</template>

<style scoped>
.viewer { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, 1fr); gap: var(--space-6); }
.viewer-media { display: grid; place-items: center; min-height: 360px; max-height: 76vh; overflow: hidden; border-radius: var(--radius-lg); background: var(--surface-alt); }
.viewer-frame { position: relative; display: inline-block; line-height: 0; max-width: 100%; }
.viewer-media img { display: block; max-width: 100%; max-height: 76vh; object-fit: contain; }
.viewer-side { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; padding-top: var(--space-5); }
.viewer-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--muted-copy); font-size: 12px; }
.viewer-meta .ant-tag { margin: 0; }
.viewer-actions { display: flex; flex-direction: column; gap: var(--space-2); }
.viewer-row { display: flex; gap: var(--space-2); }
.viewer-note { margin: 0; color: var(--muted-copy); font-size: 13px; line-height: 1.7; }
.viewer-cost { margin: 0; color: var(--muted-subtle); font-size: 12px; }
.adjust-panel { display: flex; flex-direction: column; gap: var(--space-2); }
.adjust-panel h3 { margin: 0; font-size: 15px; font-weight: 600; }
.adjust-row { display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: center; gap: var(--space-3); }
.adjust-row > span { color: var(--muted-strong); font-size: 13px; }
.adjust-row :deep(.ant-slider) { margin: 10px 14px 22px 6px; }
.adjust-row :deep(.ant-slider-mark-text) { font-size: 11px; white-space: nowrap; }
@media (max-width: 767px) {
  .viewer { grid-template-columns: 1fr; gap: var(--space-4); }
  .viewer-media { min-height: 0; max-height: 56vh; }
  .viewer-media img { max-height: 56vh; }
  .viewer-side { padding-top: 0; }
}
</style>
