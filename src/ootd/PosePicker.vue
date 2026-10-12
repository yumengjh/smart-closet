<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { CameraOutlined, EditOutlined, ThunderboltOutlined } from '@ant-design/icons-vue'
import { platformRequest, type Pose, type PoseCatalog, type PoseChoice } from '../services/platform'
import PoseCard from './PoseCard.vue'
import PoseFigure from './PoseFigure.vue'

const props = defineProps<{ catalog: PoseCatalog | null; modelValue: PoseChoice; compact?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [PoseChoice]; changed: [] }>()
const { message, modal } = App.useApp()
const tab = ref<'PRESET' | 'CUSTOM'>(props.modelValue.mode === 'CUSTOM' ? 'CUSTOM' : 'PRESET')
const extracting = ref(false); const preview = ref(''); const fresh = ref<Pose | null>(null); const freshName = ref('')
const textOpen = ref(false); const textForm = ref({ name: '', description: '' }); const saving = ref(false)
const renaming = ref(false); const renameValue = ref(''); const expanded = ref(false)

const selected = computed(() => {
  const v = props.modelValue
  if (v.mode === 'AUTO' || !props.catalog) return null
  return (v.mode === 'PRESET' ? props.catalog.presets : props.catalog.mine).find(p => p.id === v.id) || null
})
const list = computed(() => tab.value === 'PRESET' ? props.catalog?.presets || [] : props.catalog?.mine || [])
const left = computed(() => props.catalog ? Math.max(0, props.catalog.dailyExtractions - props.catalog.extractionsToday) : 0)
function isSelected(p: Pose) { return props.modelValue.mode !== 'AUTO' && props.modelValue.id === p.id }
function pick(p: Pose) { emit('update:modelValue', { mode: p.source === 'PRESET' ? 'PRESET' : 'CUSTOM', id: p.id }) }

function chooseImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { message.error('请选择 20MB 以内的 JPG、PNG 或 WebP 图片。'); return false }
  void extract(file)
  return false
}
async function extract(file: File) {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = URL.createObjectURL(file); extracting.value = true
  try {
    const data = new FormData(); data.append('file', file)
    const pose = await platformRequest<Pose>('/api/ootd/poses/extract', 'POST', data, undefined, { timeoutMs: 120000 })
    emit('changed'); tab.value = 'CUSTOM'; pick(pose); fresh.value = pose; freshName.value = pose.name
  } catch (e) { message.error(e instanceof Error ? e.message : String(e)) }
  finally { extracting.value = false; URL.revokeObjectURL(preview.value); preview.value = '' }
}
async function keepFresh() {
  const pose = fresh.value
  if (pose && freshName.value.trim() && freshName.value.trim() !== pose.name) {
    try { await platformRequest(`/api/ootd/poses/${pose.id}`, 'PATCH', { name: freshName.value.trim() }); emit('changed') } catch (e) { message.error(String(e)) }
  }
  fresh.value = null
}
async function createText() {
  if (textForm.value.description.trim().length < 4) { message.info('动作描述至少 4 个字。'); return }
  saving.value = true
  try {
    const pose = await platformRequest<Pose>('/api/ootd/poses', 'POST', { name: textForm.value.name, description: textForm.value.description, tags: [] })
    emit('changed'); tab.value = 'CUSTOM'; pick(pose); textOpen.value = false; textForm.value = { name: '', description: '' }
  } catch (e) { message.error(e instanceof Error ? e.message : String(e)) } finally { saving.value = false }
}
function startRename() { if (selected.value) { renameValue.value = selected.value.name; renaming.value = true } }
async function rename() {
  if (!selected.value) return
  try { await platformRequest(`/api/ootd/poses/${selected.value.id}`, 'PATCH', { name: renameValue.value }); renaming.value = false; emit('changed') } catch (e) { message.error(e instanceof Error ? e.message : String(e)) }
}
function remove() {
  const pose = selected.value
  if (!pose) return
  modal.confirm({ title: `删除动作卡「${pose.name}」？`, content: '已生成的图片不受影响。', okText: '删除', okType: 'danger', cancelText: '取消', async onOk() {
    await platformRequest(`/api/ootd/poses/${pose.id}`, 'DELETE'); emit('update:modelValue', { mode: 'AUTO' }); emit('changed')
  } })
}
onUnmounted(() => { if (preview.value) URL.revokeObjectURL(preview.value) })
</script>

<template>
  <div class="pose-picker">
    <div class="pose-modes">
      <button type="button" class="pose-auto" :class="{ selected: modelValue.mode === 'AUTO' }" :aria-pressed="modelValue.mode === 'AUTO'" @click="emit('update:modelValue', { mode: 'AUTO' })">
        <ThunderboltOutlined /><span><strong>自动</strong><small>按衣服风格挑动作</small></span>
      </button>
      <a-upload :before-upload="chooseImage" :show-upload-list="false" accept="image/png,image/jpeg,image/webp" :disabled="extracting || left === 0">
        <button type="button" class="pose-auto pose-extract" :disabled="extracting || left === 0"><CameraOutlined /><span><strong>从图片提取</strong><small>{{ left === 0 ? '今天次数已用完' : '生成动作卡' }}</small></span></button>
      </a-upload>
      <button type="button" class="pose-auto" @click="textOpen = true"><EditOutlined /><span><strong>文字描述</strong><small>写下想要的动作</small></span></button>
    </div>

    <div v-if="extracting" class="pose-scanning" role="status" aria-live="polite">
      <div class="pose-scan-frame"><img v-if="preview" :src="preview" alt="正在提取动作的图片" /><span class="pose-scan-line"></span></div>
      <div><strong>正在提取动作…</strong><p>只保留姿势，不保存这张图片。</p></div>
    </div>

    <a-button v-if="compact && !expanded && modelValue.mode === 'AUTO'" type="link" class="pose-more" @click="expanded = true">浏览动作卡</a-button>
    <template v-else>
      <a-segmented v-model:value="tab" :options="[{ value: 'PRESET', label: '预设动作' }, { value: 'CUSTOM', label: `我的动作卡 ${catalog?.mine.length || 0}` }]" class="pose-tabs" />
      <div v-if="list.length" class="pose-grid">
        <PoseCard v-for="p in list" :key="p.id" :pose="p" :selected="isSelected(p)" @select="pick(p)" />
      </div>
      <a-empty v-else class="pose-empty" description="上传一张喜欢的姿势图，生成你的第一张动作卡" />
    </template>

    <div v-if="selected" class="pose-selected">
      <p><strong>{{ selected.name }}</strong>{{ selected.description }}</p>
      <a-space v-if="selected.source !== 'PRESET'" size="small">
        <a-button size="small" @click="startRename">改名</a-button>
        <a-button size="small" danger @click="remove">删除</a-button>
      </a-space>
    </div>

    <a-modal :open="!!fresh" title="动作卡已生成" ok-text="就用这个" cancel-text="关闭" width="420px" @ok="keepFresh" @cancel="keepFresh">
      <div v-if="fresh" class="pose-fresh">
        <div class="pose-fresh-art"><PoseFigure :pose="fresh" animate /></div>
        <a-input v-model:value="freshName" :maxlength="12" aria-label="动作名称" />
        <div class="pose-fresh-tags"><a-tag v-for="t in fresh.tags" :key="t">{{ t }}</a-tag></div>
        <p>{{ fresh.description }}</p>
      </div>
    </a-modal>
    <a-modal v-model:open="textOpen" title="用文字新建动作" ok-text="保存动作卡" cancel-text="取消" :confirm-loading="saving" @ok="createText">
      <a-form layout="vertical">
        <a-form-item label="名称"><a-input v-model:value="textForm.name" :maxlength="12" placeholder="例如：比心" /></a-form-item>
        <a-form-item label="动作描述"><a-textarea v-model:value="textForm.description" :maxlength="300" show-count :auto-size="{ minRows: 3, maxRows: 6 }" placeholder="例如：正面站立，双手在胸前比心，头微微歪向一侧" /></a-form-item>
      </a-form>
    </a-modal>
    <a-modal v-model:open="renaming" title="动作卡改名" ok-text="保存" cancel-text="取消" width="360px" @ok="rename"><a-input v-model:value="renameValue" :maxlength="12" aria-label="动作名称" /></a-modal>
  </div>
</template>

<style scoped>
.pose-picker { display: flex; flex-direction: column; gap: var(--space-3); }
.pose-modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.pose-modes :deep(.ant-upload-wrapper), .pose-modes :deep(.ant-upload) { display: block; width: 100%; height: 100%; }
.pose-auto { display: flex; align-items: center; gap: 10px; width: 100%; height: 100%; min-height: 60px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); text-align: left; cursor: pointer; }
.pose-auto > .anticon { font-size: 18px; color: var(--accent); }
.pose-auto span { display: flex; flex-direction: column; min-width: 0; }
.pose-auto strong { font-size: 13px; font-weight: 600; }
.pose-auto small { overflow: hidden; color: var(--muted-copy); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.pose-auto.selected { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); background: var(--selection-bg); }
.pose-auto:disabled { cursor: not-allowed; opacity: .6; }
.pose-tabs { align-self: flex-start; }
.pose-more { align-self: flex-start; padding: 0; }
.pose-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: var(--space-2); }
.pose-empty { margin: var(--space-4) 0; }
.pose-scanning { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); background: var(--accent-soft); }
.pose-scanning p { margin: 2px 0 0; color: var(--muted-copy); font-size: 12px; }
.pose-scan-frame { position: relative; flex-shrink: 0; width: 60px; height: 80px; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-alt); }
.pose-scan-frame img { width: 100%; height: 100%; object-fit: cover; filter: saturate(.4) blur(1px); }
.pose-scan-line { position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--accent); box-shadow: 0 0 12px var(--accent); animation: pose-scan 1.4s ease-in-out infinite alternate; }
@keyframes pose-scan { to { top: calc(100% - 3px); } }
.pose-selected { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 10px 12px; border-radius: var(--radius-md); background: var(--surface-alt); }
.pose-selected p { flex: 1; min-width: 200px; margin: 0; color: var(--muted-copy); font-size: 12px; line-height: 1.7; }
.pose-selected strong { margin-right: 8px; color: var(--ink); font-size: 13px; }
.pose-fresh { display: flex; flex-direction: column; gap: var(--space-3); align-items: stretch; }
.pose-fresh-art { width: 200px; margin: 0 auto; aspect-ratio: 3 / 4; overflow: hidden; border-radius: var(--radius-lg); box-shadow: 0 10px 30px rgb(0 0 0 / 12%); }
.pose-fresh p { margin: 0; color: var(--muted-copy); font-size: 13px; line-height: 1.7; }
@media (max-width: 767px) { .pose-modes { grid-template-columns: 1fr 1fr 1fr; } .pose-auto { flex-direction: column; align-items: flex-start; gap: 4px; } .pose-auto small { white-space: normal; } .pose-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .pose-scan-line { animation: none; } }
</style>
