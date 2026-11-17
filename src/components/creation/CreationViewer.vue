<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { DownloadOutlined, EllipsisOutlined, ShareAltOutlined } from '@ant-design/icons-vue'
import { captureAccount } from '../../domain/accountSession'
import { creationApi } from '../../creation/api'
import type { CreationJob } from '../../creation/types'
import { mediaUrl } from '../../services/urls'
import AiBadge from '../AiBadge.vue'

const props = defineProps<{ job: CreationJob | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const { message, modal } = App.useApp()
const title = ref(''), brand = ref(true), busy = ref(false), error = ref(''), url = ref('')
let blob: Blob | null = null, epoch = 0, timer: number | undefined
const describe = (cause: unknown) => cause instanceof Error ? cause.message : '暂时未能完成，请稍后重试。'

function clear() { epoch++; clearTimeout(timer); if (url.value) URL.revokeObjectURL(url.value); url.value = ''; blob = null; busy.value = false }
async function generate() {
  const job = props.job
  if (!job) return
  const mine = ++epoch
  busy.value = true; error.value = ''
  try {
    const result = await creationApi.export(job.id, title.value, brand.value)
    if (mine !== epoch) return
    if (!result.type.includes('image/png')) throw new Error('未收到图片，请稍后重试。')
    if (url.value) URL.revokeObjectURL(url.value)
    blob = result; url.value = URL.createObjectURL(result)
  } catch (cause) { if (mine === epoch) error.value = describe(cause) }
  finally { if (mine === epoch) busy.value = false }
}
// 打开时直接生成导出图；改标题或署名后稍等片刻再重新生成。
watch(() => props.job?.id, id => { clear(); title.value = ''; brand.value = true; error.value = ''; if (id) void generate() })
watch([title, brand], () => { if (!props.job) return; clearTimeout(timer); epoch++; timer = window.setTimeout(generate, 500) })
onUnmounted(clear)

function save() {
  if (!blob || !url.value) return
  const anchor = document.createElement('a'); anchor.href = url.value; anchor.download = `yuda-${props.job?.id || 'creation'}.png`; anchor.click()
}
async function share() {
  if (!blob) return
  const same = captureAccount(), file = new File([blob], '鱼搭穿搭.png', { type: 'image/png' })
  if (!navigator.canShare?.({ files: [file] }) || !navigator.share) { save(); message.info('图片已准备保存，可以在相册中分享。'); return }
  try { await navigator.share({ files: [file] }); same() } catch (cause) { if (cause instanceof DOMException && cause.name === 'AbortError') return; message.info('暂时无法唤起分享，请使用保存图片。') }
}

const reasonOpen = ref(false), reason = ref('BAD_GARMENT'), reasonBusy = ref(false)
async function sendFeedback() {
  if (!props.job) return
  reasonBusy.value = true
  try { await creationApi.feedback(props.job.id, reason.value); reasonOpen.value = false; message.success('已记录，谢谢你的反馈。') }
  catch (cause) { message.error(describe(cause)) } finally { reasonBusy.value = false }
}
function remove() {
  const job = props.job
  if (!job) return
  modal.confirm({ title: '删除这张作品？', content: '删除后将无法再查看或保存。', okText: '删除', okType: 'danger', cancelText: '保留',
    async onOk() { await creationApi.remove(job.id); emit('close'); emit('changed') } })
}
const menu = [{ key: 'feedback', label: '效果有问题' }, { key: 'delete', label: '删除', danger: true }]
function onMenu({ key }: { key: string }) { if (key === 'feedback') reasonOpen.value = true; else remove() }
</script>

<template>
  <a-modal :open="!!job" :footer="null" centered width="min(92vw, 520px)" :title="job?.templateName" destroy-on-close @cancel="emit('close')">
    <div v-if="job" class="viewer">
      <div class="viewer-art">
        <img :src="url || mediaUrl(job.mediaUrl)" :alt="job.templateName" />
        <AiBadge v-if="!url" />
        <a-spin v-if="busy" class="viewer-spin" />
      </div>
      <a-alert v-if="error" type="error" :message="error" show-icon class="viewer-gap"><template #action><a-button size="small" @click="generate">重试</a-button></template></a-alert>
      <div class="viewer-actions">
        <a-button type="primary" size="large" :disabled="!url" @click="save"><DownloadOutlined /> 保存图片</a-button>
        <a-button size="large" :disabled="!url" @click="share"><ShareAltOutlined /> 分享</a-button>
        <a-dropdown :trigger="['click']" placement="topRight"><a-button size="large" aria-label="更多"><EllipsisOutlined /></a-button><template #overlay><a-menu :items="menu" @click="onMenu" /></template></a-dropdown>
      </div>
      <div class="viewer-opts">
        <a-input v-model:value="title" :maxlength="24" allow-clear placeholder="给这张作品留句话（可不填）" aria-label="标题" />
        <label class="viewer-brand"><a-switch v-model:checked="brand" size="small" aria-label="显示鱼搭署名" /><span>显示鱼搭署名</span></label>
      </div>
    </div>
    <a-modal :open="reasonOpen" title="哪里不合适？" ok-text="提交" cancel-text="取消" :confirm-loading="reasonBusy" @cancel="reasonOpen = false" @ok="sendFeedback">
      <a-radio-group v-model:value="reason" class="viewer-reasons"><a-radio value="BAD_GARMENT">衣服细节不对</a-radio><a-radio value="BAD_PERSON">形象不一致</a-radio><a-radio value="BAD_LAYOUT">构图不合适</a-radio><a-radio value="OTHER">其他问题</a-radio></a-radio-group>
    </a-modal>
  </a-modal>
</template>

<style scoped>
.viewer-art { position: relative; display: grid; place-items: center; aspect-ratio: 3 / 4; max-height: 62vh; margin: 0 auto; background: var(--surface-alt); border-radius: 8px; overflow: hidden; }
.viewer-art img { width: 100%; height: 100%; object-fit: contain; }
.viewer-spin { position: absolute; right: 10px; top: 10px; }
.viewer-gap { margin-top: 12px; }
.viewer-actions { display: flex; gap: 8px; margin-top: 14px; }
.viewer-actions .ant-btn-primary { flex: 1; }
.viewer-actions > .ant-btn:nth-child(2) { flex: 1; }
.viewer-opts { display: flex; gap: 12px; align-items: center; margin-top: 12px; }
.viewer-opts .ant-input-affix-wrapper { flex: 1; min-width: 0; }
.viewer-brand { display: inline-flex; align-items: center; gap: 6px; flex: none; font-size: 13px; color: var(--muted-strong); }
.viewer-reasons { display: grid; gap: 12px; }
@media (max-width: 480px) { .viewer-opts { flex-direction: column; align-items: stretch; } }
</style>
