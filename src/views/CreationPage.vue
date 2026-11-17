<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, PictureOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue'
import { closetApi, type Garment } from '../services/api'
import { platformRequest, PlatformRequestError, type Baseline, type PoseCatalog, type PoseChoice } from '../services/platform'
import { activeAccount } from '../domain/accountSession'
import { createUuid } from '../domain/id'
import { formatGarmentLabel, type Outfit } from '../domain/outfit'
import { artworkForGarment } from '../domain/outfit-images'
import { mediaUrl, thumbUrl } from '../services/urls'
import { playSound } from '../services/sound'
import { creationApi } from '../creation/api'
import { creationCatalog, loadCreationCatalog } from '../creation/access'
import { eligibleGarment } from '../creation/eligible'
import { creationInput, readPendingCreation } from '../creation/model'
import { generateBlock, nextStep, prevStep, readDraft, serializeDraft, stepBlock, stepsFor, stepTitles, type StepKey } from '../creation/steps'
import { addWork, liveWorks, refreshWorks, watchWorks } from '../creation/works'
import type { Light, PendingCreation } from '../creation/types'
import CreationGarmentPicker from '../components/creation/CreationGarmentPicker.vue'

const route = useRoute(), router = useRouter(), { message } = App.useApp()
const storagePrefix = `yixu.creation:${activeAccount() || 'anonymous'}:`
function read(key: string) { try { return sessionStorage.getItem(storagePrefix + key) } catch { return null } }
function store(key: string, value: string | null) { try { if (value === null) sessionStorage.removeItem(storagePrefix + key); else sessionStorage.setItem(storagePrefix + key, value) } catch { /* 内存里的待确认状态仍能防止重复提交。 */ } }
const pending = ref<PendingCreation | null>(readPendingCreation(read('pending')))
const templateId = ref(''), selected = ref<Garment[]>([]), baselineId = ref(''), light = ref<Light>('DEFAULT'), note = ref('')
const pose = ref<PoseChoice>({ mode: 'AUTO' }), models = ref<Baseline[]>([]), poses = ref<PoseCatalog | null>(null)
const source = ref<Outfit | null>(null), parentJobId = ref<string | undefined>()
const loading = ref(true), busy = ref(false), error = ref(''), sourceError = ref(''), ready = ref(false)
const step = ref<StepKey>('effect'), pickerOpen = ref(false)

const template = computed(() => creationCatalog.value?.templates.find(item => item.id === templateId.value))
const person = computed(() => models.value.find(item => item.id === baselineId.value))
const enabled = computed(() => Boolean(creationCatalog.value?.enabled)), locked = computed(() => busy.value || !!pending.value)
const maxGarments = computed(() => Math.min(12, template.value?.maxGarments || 12))
const steps = computed(() => stepsFor(template.value))
const stepIndex = computed(() => steps.value.indexOf(step.value))
const isLast = computed(() => stepIndex.value === steps.value.length - 1)
const progress = computed(() => Math.round(((stepIndex.value + 1) / steps.value.length) * 100))
const state = computed(() => ({ template: template.value, garmentCount: selected.value.length, hasPerson: Boolean(person.value) }))
const block = computed(() => isLast.value ? generateBlock(state.value) : stepBlock(step.value, state.value))
const poseOptions = computed(() => [{ value: 'AUTO', label: '自动' }, ...(poses.value?.presets || []).map(p => ({ value: `PRESET:${p.id}`, label: p.name })), ...(poses.value?.mine || []).map(p => ({ value: `CUSTOM:${p.id}`, label: p.name }))])
const poseValue = computed({ get: () => pose.value.mode === 'AUTO' ? 'AUTO' : `${pose.value.mode}:${pose.value.id}`, set: (value: string) => { const [mode, ...id] = value.split(':'); pose.value = mode === 'AUTO' ? { mode } : { mode: mode as 'CUSTOM' | 'PRESET', id: id.join(':') } } })
const lightOptions = computed(() => (template.value?.options.light || ['DEFAULT']).map(value => ({ value, label: { DEFAULT: '自然', WARM: '暖光', COOL: '冷光' }[value] })))
const describe = (cause: unknown) => cause instanceof Error ? cause.message : '暂时未能完成，请稍后重试。'
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

watch([templateId, selected, baselineId, light, pose, note, source], () => {
  if (ready.value) store('draft', serializeDraft({ ids: selected.value.map(item => item.id), templateId: templateId.value, baselineId: baselineId.value, light: light.value, pose: pose.value, note: note.value, outfitId: source.value?.id }))
}, { deep: true })
watch(templateId, () => {
  light.value = 'DEFAULT'
  if (!template.value?.personRequired) { baselineId.value = ''; pose.value = { mode: 'AUTO' } }
  else if (!person.value) baselineId.value = models.value.find(item => item.currentDefault)?.id || models.value[0]?.id || ''
})
watch(steps, list => { if (!list.includes(step.value)) step.value = list[list.length - 1] })
watch(pending, value => store('pending', value ? JSON.stringify(value) : null), { deep: true })
function go(target: StepKey | undefined) { if (!target) return; step.value = target; window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }) }

async function load() {
  loading.value = true; error.value = ''; sourceError.value = ''
  const draft = readDraft(read('draft'))
  const wantedTemplate = typeof route.query.template === 'string' ? route.query.template : draft.templateId
  parentJobId.value = typeof route.query.again === 'string' && route.query.again ? route.query.again : undefined
  try {
    await loadCreationCatalog(true)
    const templates = creationCatalog.value?.templates || []
    // 草稿或再试一次带来的效果仍然可用才沿用；不替用户挑一个别的效果。
    templateId.value = templates.find(item => item.id === wantedTemplate && item.available)?.id || ''
    if (enabled.value) {
      const results = await Promise.allSettled([platformRequest<Baseline[]>('/api/me/person-baselines'), platformRequest<PoseCatalog>('/api/ootd/poses')])
      if (results[0].status === 'fulfilled') models.value = results[0].value.filter(item => item.status === 'CONFIRMED')
      if (results[1].status === 'fulfilled') poses.value = results[1].value
      baselineId.value = template.value?.personRequired ? models.value.find(item => item.id === draft.baselineId)?.id || models.value.find(item => item.currentDefault)?.id || models.value[0]?.id || '' : ''
      light.value = draft.light
      if (poseOptions.value.some(item => item.value === (draft.pose.mode === 'AUTO' ? 'AUTO' : `${draft.pose.mode}:${draft.pose.id}`))) pose.value = draft.pose
      note.value = draft.note
      const outfitId = typeof route.query.outfit === 'string' ? route.query.outfit : draft.outfitId
      try {
        source.value = outfitId ? await closetApi.outfit(outfitId) : null
        const ids = source.value ? source.value.scene.elements.filter(item => item.kind !== 'PERSON_PART').map(item => item.garmentId) : draft.ids
        const garments = await Promise.allSettled([...new Set(ids)].slice(0, 12).map(id => closetApi.detail(id)))
        selected.value = garments.flatMap(item => item.status === 'fulfilled' && eligibleGarment(item.value) ? [item.value] : [])
        if (selected.value.length !== new Set(ids).size) { source.value = null; sourceError.value = '部分衣服已变化或无法使用，已移除，请再看一下。' }
      } catch (cause) { source.value = null; sourceError.value = describe(cause) }
      // 每次进来都从选效果开始；上次选过的效果、带入的衣服保留为已选，点“下一步”即可继续。
      step.value = 'effect'
    }
  } catch (cause) { error.value = describe(cause) }
  finally { loading.value = false; ready.value = true }
}

function chooseEffect(id: string) {
  if (locked.value) return
  templateId.value = id
  if (!stepBlock('effect', state.value)) go(nextStep(steps.value, 'effect'))
}
function toggle(g: Garment) {
  if (locked.value) return
  if (selected.value.some(item => item.id === g.id)) selected.value = selected.value.filter(item => item.id !== g.id)
  else if (selected.value.length >= maxGarments.value) { message.info(`最多选 ${maxGarments.value} 件`); return }
  else selected.value = [...selected.value, g]
  source.value = null
}
const remove = (g: Garment) => toggle(g)

/** 提交（或核对）已有的待确认记录；不确定的结果保留 pending，原键重试。 */
async function settle() {
  if (!pending.value) return
  busy.value = true; error.value = ''
  try {
    const job = await creationApi.submit(pending.value)
    pending.value = null; parentJobId.value = undefined
    addWork(job); void refreshWorks(1)
    playSound('success'); message.success('开始创作了，做好会提醒你')
    await router.push('/creation/works')
  } catch (cause) {
    if (cause instanceof PlatformRequestError && !cause.uncertain) pending.value = null
    error.value = describe(cause)
  } finally { busy.value = false }
}
async function generate() {
  if (busy.value) return
  if (pending.value) return settle()
  if (block.value || !template.value) return
  busy.value = true; error.value = ''
  try {
    const preparation = await creationApi.prepare(creationInput(template.value, selected.value, person.value, light.value, pose.value, note.value, source.value || undefined, parentJobId.value))
    pending.value = { key: createUuid(), preparationId: preparation.preparationId }
  } catch (cause) { error.value = describe(cause); busy.value = false; return }
  busy.value = false
  await settle()
}
function back() {
  const before = prevStep(steps.value, step.value)
  if (before && !locked.value) go(before)
  else if (window.history.length > 1) router.back()
  else void router.push('/try')
}

let stopWatching: (() => void) | undefined
onMounted(() => { void load(); void refreshWorks(1); stopWatching = watchWorks(); document.documentElement.classList.add('closet-selecting') })
onUnmounted(() => { stopWatching?.(); document.documentElement.classList.remove('closet-selecting') })
</script>

<template>
  <div class="cs-page">
    <header class="cs-head">
      <a-button type="text" shape="circle" aria-label="返回" @click="back"><ArrowLeftOutlined /></a-button>
      <h1>穿搭创作</h1>
      <a-badge :dot="liveWorks > 0" :offset="[-6, 6]"><a-button type="text" @click="router.push('/creation/works')">我的作品</a-button></a-badge>
    </header>
    <a-skeleton v-if="loading" active :paragraph="{ rows: 6 }" />
    <template v-else-if="!enabled">
      <a-alert v-if="error" type="error" :message="error" show-icon class="cs-alert"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
      <a-empty v-else description="穿搭创作暂未开放"><a-button @click="router.push('/creation/works')">看我的作品</a-button></a-empty>
    </template>
    <template v-else>
      <div class="cs-progress"><a-progress :percent="progress" :show-info="false" size="small" stroke-color="var(--ink)" :aria-label="stepTitles[step]" /><span>{{ stepTitles[step] }}</span></div>
      <a-alert v-if="pending && !busy" type="warning" message="上次提交结果等你确认" show-icon class="cs-alert"><template #action><a-button size="small" :loading="busy" @click="settle">核对结果</a-button></template></a-alert>
      <a-alert v-if="error" type="error" :message="error" show-icon class="cs-alert" />

      <main v-if="step === 'effect'" class="cs-step">
        <div class="cs-effects" role="group" aria-label="选效果">
          <a-button v-for="item in creationCatalog?.templates" :key="item.id" type="text" class="cs-effect" :class="{ on: templateId === item.id }" :disabled="locked || !item.available" :aria-pressed="templateId === item.id" @click="chooseEffect(item.id)">
            <span class="cs-effect-art"><img v-if="item.previewUrl" :src="mediaUrl(item.previewUrl)" alt="" loading="lazy" /><PictureOutlined v-else /><span v-if="templateId === item.id" class="cs-check"><CheckOutlined /></span></span>
            <strong>{{ item.name }}</strong><small>{{ item.available ? item.description : item.unavailableReason || '暂不可用' }}</small>
          </a-button>
        </div>
        <a-empty v-if="!creationCatalog?.templates.length" :image="null" description="效果正在准备，稍后再来" />
      </main>

      <main v-else-if="step === 'garments'" class="cs-step">
        <a-alert v-if="sourceError" type="warning" :message="sourceError" class="cs-alert" />
        <p v-if="source" class="cs-note">来自搭配「{{ source.name }}」</p>
        <div class="cs-count">已选 {{ selected.length }} / 最多 {{ maxGarments }}</div>
        <div v-if="selected.length" class="cs-selected">
          <div v-for="g in selected" :key="g.id" class="cs-chosen">
            <img :src="thumbUrl(artworkForGarment(g).url, 220)" :alt="formatGarmentLabel(g)" />
            <a-button size="small" shape="circle" class="cs-remove" :disabled="locked" :aria-label="`移除${formatGarmentLabel(g)}`" @click="remove(g)"><CloseOutlined /></a-button>
          </div>
        </div>
        <a-button size="large" block class="cs-pick" :disabled="locked" @click="pickerOpen = true"><PlusOutlined /> 从衣柜挑</a-button>
        <a-collapse v-if="isLast" ghost class="cs-more"><a-collapse-panel key="more" header="更多设置">
          <a-form layout="vertical">
            <a-form-item v-if="lightOptions.length > 1" label="光线"><a-segmented v-model:value="light" :disabled="locked" :options="lightOptions" /></a-form-item>
            <a-form-item label="补充说明"><a-textarea v-model:value="note" :disabled="locked" :maxlength="200" show-count :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="例如：背景明亮一些" /></a-form-item>
          </a-form>
        </a-collapse-panel></a-collapse>
      </main>

      <main v-else class="cs-step">
        <div v-if="models.length" class="cs-people" role="group" aria-label="谁来穿">
          <a-button v-for="model in models" :key="model.id" type="text" class="cs-person" :class="{ on: model.id === baselineId }" :disabled="locked" :aria-pressed="model.id === baselineId" @click="baselineId = model.id">
            <span class="cs-person-art"><img v-if="model.mediaUrl" :src="mediaUrl(model.mediaUrl)" alt="" loading="lazy" /><span v-if="model.id === baselineId" class="cs-check"><CheckOutlined /></span></span>
            <strong>{{ model.name || '我的形象' }}</strong>
          </a-button>
        </div>
        <a-empty v-else description="还没有已确认的形象">
          <a-space direction="vertical" align="center">
            <a-button type="primary" @click="router.push('/settings?section=personal')">去设置形象</a-button>
            <a-button type="link" :disabled="locked" @click="go('effect')">换个不需要人物的效果</a-button>
          </a-space>
        </a-empty>
        <a-collapse ghost class="cs-more"><a-collapse-panel key="more" header="更多设置">
          <a-form layout="vertical">
            <a-form-item label="动作"><a-select v-model:value="poseValue" :disabled="locked" :options="poseOptions" /></a-form-item>
            <a-form-item v-if="lightOptions.length > 1" label="光线"><a-segmented v-model:value="light" :disabled="locked" :options="lightOptions" /></a-form-item>
            <a-form-item label="补充说明"><a-textarea v-model:value="note" :disabled="locked" :maxlength="200" show-count :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="例如：背景明亮一些" /></a-form-item>
          </a-form>
        </a-collapse-panel></a-collapse>
      </main>

      <footer class="cs-bar">
        <p v-if="block && !loading" class="cs-block" role="status">{{ block }}</p>
        <div class="cs-bar-row">
          <a-button v-if="stepIndex > 0" size="large" :disabled="locked" @click="back">上一步</a-button>
          <a-button v-if="!isLast" type="primary" size="large" :disabled="!!block" @click="go(nextStep(steps, step))">下一步</a-button>
          <a-button v-else type="primary" size="large" :loading="busy" :disabled="(!!block && !pending)" @click="generate">{{ pending ? '核对结果' : '生成 · 1 次' }}</a-button>
        </div>
        <p v-if="isLast" class="cs-cost">与上身图共用次数
          <a-popover placement="top" trigger="click">
            <template #content><div class="cs-rules">生成一次用 1 次，与上身图共用。<br />发出后失败、取消或结果待确认，也会用掉 1 次，不自动返还。<br />图片可能与实物有差异，完成后请核对衣服细节。<br /><a @click="router.push('/help?article=08-creation')">了解更多</a></div></template>
            <a-button type="text" size="small" shape="circle" aria-label="次数规则"><QuestionCircleOutlined /></a-button>
          </a-popover>
        </p>
      </footer>
    </template>
    <CreationGarmentPicker v-model:open="pickerOpen" :selected-ids="selected.map(g => g.id)" :max="maxGarments" :locked="locked" @toggle="toggle" />
  </div>
</template>

<style scoped>
.cs-page { max-width: 640px; margin: 0 auto; padding: 0 16px 168px; }
.cs-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 52px; }
.cs-head h1 { flex: 1; margin: 0; font-size: 17px; font-weight: 600; text-align: center; }
.cs-head .ant-btn:last-child { margin-right: -8px; }
.cs-progress { display: flex; align-items: center; gap: 12px; margin: 4px 0 16px; }
.cs-progress :deep(.ant-progress) { flex: 1; margin: 0; line-height: 1; }
.cs-progress span { flex: none; font-size: 13px; color: var(--muted-strong); }
.cs-alert { margin-bottom: 12px; }
.cs-effects { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cs-effect.ant-btn, .cs-person.ant-btn { display: block; height: auto; padding: 0; white-space: normal; text-align: left; color: var(--ink); }
.cs-effect-art, .cs-person-art { position: relative; display: grid; place-items: center; overflow: hidden; width: 100%; aspect-ratio: 3 / 4; border-radius: 10px; background: var(--surface-alt); border: 1px solid var(--line); color: var(--muted); font-size: 28px; }
.cs-effect-art img, .cs-person-art img { width: 100%; height: 100%; object-fit: cover; }
.cs-effect.on .cs-effect-art, .cs-person.on .cs-person-art { outline: 2px solid var(--ink); outline-offset: 2px; }
.cs-effect strong, .cs-person strong { display: block; margin-top: 8px; font-size: 14px; }
.cs-effect small { display: block; margin-top: 2px; font-size: 12px; line-height: 1.5; color: var(--muted-strong); }
.cs-effect[disabled] small { color: var(--muted-strong); }
.cs-check { position: absolute; right: 8px; top: 8px; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: var(--action-bg); color: var(--action-fg); font-size: 12px; }
.cs-note { margin: 0 0 8px; font-size: 13px; color: var(--muted-strong); }
.cs-count { margin-bottom: 10px; font-size: 13px; color: var(--muted-strong); font-variant-numeric: tabular-nums; }
.cs-selected { display: flex; gap: 8px; overflow-x: auto; padding: 4px 4px 10px; margin: 0 -4px; }
.cs-chosen { position: relative; flex: 0 0 76px; height: 76px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-alt); }
.cs-chosen img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
.cs-remove.ant-btn { position: absolute; right: -6px; top: -6px; width: 22px; min-width: 22px; height: 22px; padding: 0; font-size: 10px; }
.cs-pick.ant-btn { height: 56px; margin-top: 4px; border-style: dashed; }
.cs-more { margin-top: 12px; }
.cs-more :deep(.ant-collapse-header) { padding-inline: 0 !important; }
.cs-more :deep(.ant-collapse-content-box) { padding-inline: 0 !important; }
.cs-people { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cs-bar { position: fixed; z-index: 40; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 640px); padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: var(--surface); border-top: 1px solid var(--line); }
.cs-bar-row { display: flex; gap: 10px; }
.cs-bar-row .ant-btn-primary { flex: 1; }
.cs-bar .ant-btn-lg { height: 48px; }
.cs-block { margin: 0 0 8px; text-align: center; font-size: 13px; color: var(--muted-strong); }
.cs-cost { margin: 6px 0 0; text-align: center; font-size: 12px; color: var(--muted-strong); }
.cs-rules { max-width: 260px; font-size: 13px; line-height: 1.7; }
@media (min-width: 768px) { .cs-effects, .cs-people { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cs-bar { border: 1px solid var(--line); border-bottom: 0; border-radius: 12px 12px 0 0; } }
</style>
