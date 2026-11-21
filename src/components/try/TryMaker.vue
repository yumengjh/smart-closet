<script setup lang="ts">
// “做张图”（试穿与创作合并，server#271 3.1）：选效果 → 选衣服 → 谁来穿（需要人物时）→ 生成。
// 效果列表第一张固定是上身图（内置，衣服只能从已保存的搭配选，生成走 /api/ootd/*，逻辑在 useOotdStudio），
// 其后是后台已上线的创作效果（与原 /creation 一致，走 /api/creations/*）。创作关闭或目录为空时只剩上身图，跳过选效果。
// 每次进入从选效果开始；带入的搭配或衣服、上次的效果保留为已选（#257 90e56dd）。
// “谁来穿”一屏看完（server 设计 2026-11-21 第 4 节）：这套 + 谁来穿、部位清单（PartList，进入即查、改动 300ms 防抖重查）、
// 姿势一行（PoseRow），其余收进“更多”；底栏不能生成时只写一句原因，点禁用的按钮滚到第一个要处理的地方。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { CheckOutlined, CloseOutlined, PictureOutlined, PlusOutlined, QuestionCircleOutlined, SkinOutlined, UserOutlined } from '@ant-design/icons-vue'
import { closetApi, type Garment } from '../../services/api'
import { PlatformRequestError, type PoseChoice } from '../../services/platform'
import { activeAccount } from '../../domain/accountSession'
import { createUuid } from '../../domain/id'
import { formatGarmentLabel, roleFromGarment, type Outfit } from '../../domain/outfit'
import { artworkForGarment } from '../../domain/outfit-images'
import { mediaUrl, thumbUrl } from '../../services/urls'
import { playSound } from '../../services/sound'
import { useBillingStore } from '../../billing/store'
import { imageActionLabel } from '../../billing/model'
import { useClosetStore } from '../../stores/closet'
import { candidateScene } from '../../agent/bridge'
import { creationApi } from '../../creation/api'
import { creationCatalog, loadCreationCatalog } from '../../creation/access'
import { eligibleGarment } from '../../creation/eligible'
import { creationInput, readPendingCreation } from '../../creation/model'
import { canChooseEffect, effectsFor, entryStep, generateBlock, isOutfitEffect, nextStep, OUTFIT_EFFECT_ID, prevStep, readDraft, serializeDraft, stepBlock, stepsFor, stepTitles, type StepKey } from '../../creation/steps'
import { addWork, refreshWorks } from '../../creation/works'
import type { Light, PendingCreation } from '../../creation/types'
import { ALBUM_PATH } from '../../try/routes'
import { track } from '../../services/analytics'
import { useProcessingStore } from '../../stores/processing'
import { useOotdStudio } from '../../ootd/useOotdStudio'
import { useWearCheck } from '../../ootd/useWearCheck'
import { barReason, pruneWear, reviewPassed, reviewReason, type FitFix, type FitGarment } from '../../ootd/part-list'
import PartList from '../../ootd/PartList.vue'
import PoseRow from '../../ootd/PoseRow.vue'
import CreationGarmentPicker from '../creation/CreationGarmentPicker.vue'
import OutfitCollage from '../../today/OutfitCollage.vue'
import { scenePieces } from '../../today/deck'
import AiBadge from '../AiBadge.vue'
import ModelPicker from '../../ootd/ModelPicker.vue'
import PosePicker from '../../ootd/PosePicker.vue'
import OotdMore from '../../ootd/OotdMore.vue'
import OotdConfirmModal from '../../ootd/OotdConfirmModal.vue'
import { modelLabel } from '../../ootd/labels'

const route = useRoute(), router = useRouter(), { message } = App.useApp(), billing = useBillingStore(), closet = useClosetStore(), processing = useProcessingStore()
const storagePrefix = `yixu.creation:${activeAccount() || 'anonymous'}:`
function read(key: string) { try { return sessionStorage.getItem(storagePrefix + key) } catch { return null } }
function store(key: string, value: string | null) { try { if (value === null) sessionStorage.removeItem(storagePrefix + key); else sessionStorage.setItem(storagePrefix + key, value) } catch { /* 内存里的待确认状态仍能防止重复提交。 */ } }

// 两种效果共用：带入的搭配、谁来穿、姿势。
const outfitId = ref(''), baselineId = ref(''), pose = ref<PoseChoice>({ mode: 'AUTO' }), reviewingOutfit = ref(false)
const studio = useOotdStudio({ outfitId, baselineId, pose }, { accepted: () => { track('try_make_start', { effect: 'outfit' }); void router.push(ALBUM_PATH) }, reviewing: () => reviewingOutfit.value })
// 创作效果：衣服（≤12，可临时挑）、光线、补充、再试一次。sourceOutfit 只在衣服与那套搭配完全一致时才随提交带上。
const pending = ref<PendingCreation | null>(readPendingCreation(read('pending')))
const templateId = ref(''), selected = ref<Garment[]>([]), light = ref<Light>('DEFAULT'), note = ref('')
const sourceOutfit = ref<Outfit | null>(null), parentJobId = ref<string | undefined>()
const loading = ref(true), busy = ref(false), error = ref(''), sourceError = ref(''), ready = ref(false)
const step = ref<StepKey>('effect'), pickerOpen = ref(false), sheet = ref<'' | 'person' | 'pose'>('')
// 需要人物的创作效果：这次不穿的（skipped，不随提交带上）与穿前检查的回答（wearRoles，随提交带上）。
const skipped = ref<string[]>([]), creationRoles = ref<Record<string, string>>({}), partList = ref<InstanceType<typeof PartList>>()

const effects = computed(() => effectsFor(creationCatalog.value))
const chooseEffect = computed(() => canChooseEffect(creationCatalog.value))
const template = computed(() => effects.value.find(item => item.id === templateId.value))
const outfitMode = computed(() => isOutfitEffect(template.value))
const person = computed(() => studio.person)
const locked = computed(() => busy.value || studio.busy || !!pending.value)
const maxGarments = computed(() => Math.min(12, template.value?.maxGarments || 12))
const steps = computed(() => stepsFor(template.value, chooseEffect.value))
const stepIndex = computed(() => Math.max(0, steps.value.indexOf(step.value)))
const isLast = computed(() => stepIndex.value === steps.value.length - 1)
const progress = computed(() => Math.round(((stepIndex.value + 1) / steps.value.length) * 100))
const state = computed(() => outfitMode.value
  ? { template: template.value, garmentCount: studio.current ? studio.selected.length : selected.value.length, hasPerson: Boolean(person.value), hasOutfit: Boolean(studio.current) }
  : { template: template.value, garmentCount: selected.value.length, hasPerson: Boolean(person.value) })
const block = computed(() => {
  if (!isLast.value) return stepBlock(step.value, state.value)
  // 不能生成时只写一句：最先是检查的拦截，其次“有 N 件要你选”，再其次页面自己的原因（如先设置谁来穿）。
  return barReason(fitReview.value, generateBlock(state.value) || (outfitMode.value && !studio.capability ? '暂时没有可用的生成服务' : ''))
})
const personStep = computed(() => step.value === 'person' && Boolean(template.value?.personRequired))
const wornIds = computed(() => selected.value.map(item => item.id).filter(id => !skipped.value.includes(id)))
const creationCheck = useWearCheck(() => selected.value.length ? { scene: { elements: selected.value.map(item => ({ kind: 'GARMENT', garmentId: item.id })) }, selectedGarmentIds: wornIds.value, wearRoles: creationRoles.value } : null, () => personStep.value && !outfitMode.value)
watch([personStep, outfitMode], ([on, outfit]) => { reviewingOutfit.value = on && outfit }, { immediate: true })
const fitReview = computed(() => !personStep.value ? null : outfitMode.value ? studio.review : creationCheck.review.value)
const fitBlocked = computed(() => Boolean(reviewReason(fitReview.value)))
const fitGarments = computed<FitGarment[]>(() => outfitMode.value
  ? studio.garments.map(item => ({ id: item.garmentId, label: item.garmentLabel, thumb: thumbUrl(item.assetUrl, 120) || null }))
  : selected.value.map(item => ({ id: item.id, label: formatGarmentLabel(item), thumb: thumbUrl(artworkForGarment(item).url, 120) || null })))
const creationPieces = computed(() => selected.value.map(item => ({ id: item.id, role: roleFromGarment(item), displayUrl: artworkForGarment(item).url })))
// “更多”折叠的摘要只写改过的内容；姿势单独一行，不再重复。
const moreSummary = computed(() => outfitMode.value
  ? studio.wearSummary ? '已调整穿法' : ''
  : [light.value !== 'DEFAULT' ? `光线${lightOptions.value.find(item => item.value === light.value)?.label || ''}` : '', note.value.trim() ? '已写补充' : ''].filter(Boolean).join(' · '))
const carried = computed(() => studio.current ? `${studio.current.name} · ${studio.garments.length} 件` : sourceOutfit.value ? `${sourceOutfit.value.name} · ${selected.value.length} 件` : selected.value.length ? `${selected.value.length} 件衣服` : '')
/** 草稿里的姿势仍在姿势库里才沿用。 */
const knownPose = (choice: PoseChoice) => choice.mode === 'AUTO' || (choice.mode === 'PRESET' ? studio.poseCatalog?.presets : studio.poseCatalog?.mine)?.some(item => item.id === choice.id)
const lightOptions = computed(() => (template.value?.options.light || ['DEFAULT']).map(value => ({ value, label: { DEFAULT: '自然', WARM: '暖光', COOL: '冷光' }[value] })))
const describe = (cause: unknown) => cause instanceof Error ? cause.message : '暂时未能完成，请稍后重试。'
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const wideQuery = window.matchMedia('(min-width: 1024px)'), wide = ref(wideQuery.matches), onWide = () => { wide.value = wideQuery.matches }

watch([templateId, selected, baselineId, light, pose, note, outfitId], () => {
  if (ready.value) store('draft', serializeDraft({ ids: selected.value.map(item => item.id), templateId: templateId.value, baselineId: baselineId.value, light: light.value, pose: pose.value, note: note.value, outfitId: outfitId.value || undefined }))
}, { deep: true })
watch(templateId, () => { if (ready.value) light.value = 'DEFAULT' })
watch(steps, list => { if (!list.includes(step.value)) step.value = list[list.length - 1] })
watch(pending, value => store('pending', value ? JSON.stringify(value) : null), { deep: true })
watch(baselineId, (_value, old) => { if (old && sheet.value === 'person') sheet.value = '' })
// 挑的衣服变了：只保留仍在的衣服的“这次不穿”与穿法。
watch(selected, list => { const ids = list.map(item => item.id); skipped.value = skipped.value.filter(id => ids.includes(id)); creationRoles.value = pruneWear(creationRoles.value, ids) })
function go(target: StepKey | undefined) { if (!target) return; step.value = target; window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }) }

/** 创作用的衣服：来自搭配时取那套里能用的，否则取草稿里的；有衣服用不了时不再算“来自搭配”。 */
async function loadCreationGarments(id: string, ids: string[]) {
  sourceError.value = ''
  try {
    const outfit = id ? studio.outfits.find(item => item.id === id) || await closetApi.outfit(id) : null
    const wanted = [...new Set(outfit ? outfit.scene.elements.filter(item => item.kind !== 'PERSON_PART').map(item => item.garmentId) : ids)]
    const garments = await Promise.allSettled(wanted.slice(0, 12).map(garmentId => closetApi.detail(garmentId)))
    if (id !== outfitId.value && outfit) return
    selected.value = garments.flatMap(item => item.status === 'fulfilled' && eligibleGarment(item.value) ? [item.value] : [])
    sourceOutfit.value = outfit && selected.value.length === wanted.length ? outfit : null
    if (selected.value.length !== wanted.length) sourceError.value = '部分衣服已变化或无法使用，已移除，请再看一下。'
  } catch (cause) { sourceOutfit.value = null; sourceError.value = describe(cause) }
}

async function load() {
  loading.value = true; ready.value = false; error.value = ''; sourceError.value = ''
  const draft = readDraft(read('draft'))
  const wantedTemplate = typeof route.query.template === 'string' ? route.query.template : draft.templateId
  parentJobId.value = typeof route.query.again === 'string' && route.query.again ? route.query.again : undefined
  outfitId.value = typeof route.query.outfit === 'string' ? route.query.outfit : draft.outfitId || ''
  baselineId.value = draft.baselineId
  // 创作目录取不到时只当作创作关闭：上身图照常可用。
  await Promise.allSettled([loadCreationCatalog(true), studio.load()])
  // 草稿或再试一次带来的效果仍然可用才沿用；否则默认上身图，不替用户挑别的创作效果。
  templateId.value = effects.value.find(item => item.id === wantedTemplate && item.available)?.id || OUTFIT_EFFECT_ID
  light.value = draft.light; note.value = draft.note
  if (knownPose(draft.pose)) pose.value = draft.pose
  if (chooseEffect.value) await loadCreationGarments(outfitId.value, draft.ids)
  await nextTick() // 让“这次穿哪些”按带入的搭配先填好，再判断落在哪一步。
  step.value = entryStep(steps.value, state.value)
  loading.value = false; ready.value = true
}

function pickEffect(id: string) {
  if (locked.value) return
  templateId.value = id
  if (!stepBlock('effect', state.value)) go(nextStep(steps.value, 'effect'))
}
function pickOutfit(id: string) {
  if (locked.value) return
  outfitId.value = id
  if (chooseEffect.value) void loadCreationGarments(id, [])
  go(nextStep(steps.value, 'garments'))
}
function toggle(g: Garment) {
  if (locked.value) return
  if (selected.value.some(item => item.id === g.id)) selected.value = selected.value.filter(item => item.id !== g.id)
  else if (selected.value.length >= maxGarments.value) { message.info(`最多选 ${maxGarments.value} 件`); return }
  else selected.value = [...selected.value, g]
  // 改过的衣服不再是那套搭配；之后选上身图会请用户先存成搭配。
  sourceOutfit.value = null; outfitId.value = ''
}
/** M3：临时挑的衣服不直接做上身图。带到搭配编辑器成为一份未保存的草稿，由用户自己保存。 */
async function saveAsOutfit() {
  const username = closet.user?.username
  if (!username || !selected.value.length) return
  try {
    const name = '新搭配', scene = await candidateScene({ name, reason: '', garmentIds: selected.value.map(item => item.id) })
    const id = createUuid()
    localStorage.setItem(`yixu.outfit-draft.v1:${username}:new:${id}`, JSON.stringify({ name, revision: null, scene, savedAt: Date.now() }))
    await router.push({ path: '/outfits/new', query: { draft: id } })
  } catch { message.error('暂时没能带到搭配，请稍后再试。') }
}

/** 提交（或核对）已有的待确认记录；不确定的结果保留 pending，原键重试。 */
async function settle() {
  if (!pending.value) return
  busy.value = true; error.value = ''
  try {
    const job = await creationApi.submit(pending.value)
    pending.value = null; parentJobId.value = undefined
    track('try_make_start', { effect: 'creative' })
    addWork(job); processing.trackCreation(job, true); void refreshWorks(1)
    playSound('success'); message.success('开始创作了，做好会提醒你')
    await router.push(ALBUM_PATH)
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
    const personal = template.value.personRequired
    // 需要人物时按当前选择再查一次（不等防抖）；没通过就停在清单上，原因已写在那里。
    if (personal && !reviewPassed(await creationCheck.run().catch(() => null))) { busy.value = false; if (fitBlocked.value) partList.value?.focusFirst(); return }
    const garments = personal ? selected.value.filter(item => wornIds.value.includes(item.id)) : selected.value
    const source = personal && skipped.value.length ? undefined : sourceOutfit.value || undefined
    const preparation = await creationApi.prepare(creationInput(template.value, garments, person.value, light.value, pose.value, note.value, source, parentJobId.value, personal ? creationRoles.value : {}))
    pending.value = { key: createUuid(), preparationId: preparation.preparationId }
  } catch (cause) { error.value = describe(cause); busy.value = false; return }
  busy.value = false
  await settle()
}
/** 部位清单的改动：上身图写回 useOotdStudio，创作效果记在本页。 */
function setWorn(ids: string[]) { if (outfitMode.value) studio.selected = ids; else skipped.value = selected.value.map(item => item.id).filter(id => !ids.includes(id)) }
function setRoles(roles: Record<string, string>) { if (outfitMode.value) studio.wearRoles = roles; else creationRoles.value = roles }
function recheck() { void (outfitMode.value ? studio.check() : creationCheck.run()).catch(() => {}) }
/** 去加 ›：上身图去搭配编辑器打开这套；创作效果回到“选衣服”。 */
function onFix(_fix: FitFix) {
  if (locked.value) return
  if (outfitMode.value && studio.current) void router.push(`/outfits/${encodeURIComponent(studio.current.id)}`)
  else go('garments')
}
/** 点禁用的生成按钮：有检查原因时滚到第一个要处理的地方；没设置形象时打开“谁来穿”。 */
function nudge() {
  if (!block.value || locked.value) return
  if (fitBlocked.value) partList.value?.focusFirst()
  else if (personStep.value && !person.value) sheet.value = 'person'
}
function back() { const before = prevStep(steps.value, step.value); if (before && !locked.value) go(before) }

onMounted(() => { void load(); wideQuery.addEventListener('change', onWide) })
onUnmounted(() => wideQuery.removeEventListener('change', onWide))
</script>

<template>
  <a-skeleton v-if="loading" active :paragraph="{ rows: 6 }" class="tm-skeleton" />
  <div v-else class="tm">
    <main class="tm-main">
      <div v-if="steps.length > 1" class="tm-progress"><a-progress :percent="progress" :show-info="false" size="small" stroke-color="var(--ink)" :aria-label="stepTitles[step]" /><span>{{ stepTitles[step] }}</span></div>
      <a-alert v-if="pending && !busy" type="warning" message="上次提交结果等你确认" show-icon class="tm-alert"><template #action><a-button size="small" :loading="busy" @click="settle">核对结果</a-button></template></a-alert>
      <a-alert v-if="error" type="error" :message="error" show-icon class="tm-alert" />
      <a-alert v-if="studio.error && !studio.confirmOpen" type="error" :message="studio.error" show-icon closable class="tm-alert" @close="studio.error = ''" />

      <section v-if="step === 'effect'" class="tm-step" aria-label="选效果">
        <div class="tm-effects" role="group" aria-label="选效果">
          <a-button v-for="item in effects" :key="item.id" type="text" class="tm-card" :class="{ on: templateId === item.id }" :disabled="locked || !item.available" :aria-pressed="templateId === item.id" @click="pickEffect(item.id)">
            <span class="tm-card-art">
              <template v-if="isOutfitEffect(item)"><template v-if="person?.mediaUrl"><img :src="mediaUrl(person.mediaUrl)" alt="" loading="lazy" /><AiBadge small /></template><UserOutlined v-else /></template>
              <template v-else><img v-if="item.previewUrl" :src="mediaUrl(item.previewUrl)" alt="" loading="lazy" /><PictureOutlined v-else /></template>
              <span v-if="templateId === item.id" class="tm-check"><CheckOutlined /></span>
            </span>
            <strong>{{ item.name }}</strong><small>{{ item.available ? item.description : item.unavailableReason || '暂不可用' }}</small>
          </a-button>
        </div>
        <p v-if="carried" class="tm-note">带入：{{ carried }}</p>
      </section>

      <section v-else-if="step === 'garments' && outfitMode" class="tm-step" aria-label="从搭配选">
        <a-alert v-if="!studio.current && selected.length" type="info" show-icon class="tm-alert" message="上身图要用存好的搭配" :description="`刚挑的 ${selected.length} 件还不是搭配，先存成搭配再来。`">
          <template #action><a-button size="small" @click="saveAsOutfit">先存成搭配</a-button></template>
        </a-alert>
        <p class="tm-label">从搭配选</p>
        <div v-if="studio.outfits.length" class="tm-outfits">
          <button v-for="o in studio.outfits" :key="o.id" type="button" class="tm-outfit" :class="{ on: o.id === outfitId }" :aria-pressed="o.id === outfitId" :disabled="locked" @click="pickOutfit(o.id)"><span class="tm-outfit-media"><OutfitCollage :pieces="scenePieces(o.scene)" :title="o.name" :size="320" /></span><b>{{ o.name }}</b></button>
        </div>
        <div v-else class="tm-empty"><p>还没有保存的搭配。去“今天”挑一套，点 ☆ 收进来。</p><a-button type="primary" @click="router.push('/today')">去今天看看</a-button></div>
      </section>

      <section v-else-if="step === 'garments'" class="tm-step" aria-label="选衣服">
        <a-alert v-if="sourceError" type="warning" :message="sourceError" class="tm-alert" />
        <p v-if="sourceOutfit" class="tm-note">来自搭配「{{ sourceOutfit.name }}」</p>
        <div class="tm-count">已选 {{ selected.length }} / 最多 {{ maxGarments }}</div>
        <div v-if="selected.length" class="tm-selected">
          <div v-for="g in selected" :key="g.id" class="tm-chosen">
            <img :src="thumbUrl(artworkForGarment(g).url, 220)" :alt="formatGarmentLabel(g)" />
            <a-button size="small" shape="circle" class="tm-remove" :disabled="locked" :aria-label="`移除${formatGarmentLabel(g)}`" @click="toggle(g)"><CloseOutlined /></a-button>
          </div>
        </div>
        <a-button size="large" block class="tm-pick" :disabled="locked" @click="pickerOpen = true"><PlusOutlined /> 从衣柜挑</a-button>
        <a-collapse v-if="isLast" ghost class="tm-more"><a-collapse-panel key="more" header="更多设置">
          <a-form layout="vertical">
            <a-form-item v-if="lightOptions.length > 1" label="光线"><a-segmented v-model:value="light" :disabled="locked" :options="lightOptions" /></a-form-item>
            <a-form-item label="补充说明"><a-textarea v-model:value="note" :disabled="locked" :maxlength="200" show-count :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="例如：背景明亮一些" /></a-form-item>
          </a-form>
        </a-collapse-panel></a-collapse>
      </section>

      <section v-else class="tm-step" aria-label="谁来穿">
        <div class="tm-pair">
          <button type="button" class="tm-tile" :class="{ empty: outfitMode ? !studio.current : !selected.length }" :disabled="locked" @click="go('garments')">
            <span class="tm-tile-media">
              <OutfitCollage v-if="outfitMode && studio.current" :pieces="scenePieces(studio.current.scene)" :title="studio.current.name" />
              <OutfitCollage v-else-if="!outfitMode && selected.length" :pieces="creationPieces" :title="sourceOutfit?.name || ''" />
              <span v-else class="tm-tile-empty"><SkinOutlined /><b>{{ outfitMode ? '选一套搭配' : '挑几件衣服' }}</b></span>
            </span>
            <span class="tm-tile-label"><small>这套</small><b>{{ outfitMode ? studio.current?.name || '还没选' : sourceOutfit?.name || (selected.length ? `${selected.length} 件衣服` : '还没选') }}</b><em>换</em></span>
          </button>
          <span class="tm-plus" aria-hidden="true"><PlusOutlined /></span>
          <button type="button" class="tm-tile" :class="{ empty: !person }" :disabled="locked" @click="sheet = 'person'">
            <span class="tm-tile-media"><template v-if="person?.mediaUrl"><img :src="mediaUrl(person.mediaUrl)" :alt="modelLabel(person)" /><AiBadge small /></template><span v-else class="tm-tile-empty"><UserOutlined /><b>{{ studio.baselines.length ? '选一个形象' : '设置我的形象' }}</b></span></span>
            <span class="tm-tile-label"><small>谁来穿</small><b>{{ person ? modelLabel(person) : '还没设置' }}</b><em>换</em></span>
          </button>
        </div>
        <PartList v-if="outfitMode ? studio.current : selected.length" ref="partList" :review="fitReview" :garments="fitGarments"
          :selected="outfitMode ? studio.selected : wornIds" :wear-roles="outfitMode ? studio.wearRoles : creationRoles"
          :error="outfitMode ? studio.reviewError : creationCheck.error.value" :disabled="locked"
          @update:selected="setWorn" @update:wear-roles="setRoles" @fix="onFix" @retry="recheck" />
        <PoseRow :pose="pose" :catalog="studio.poseCatalog" :disabled="locked" @open="sheet = 'pose'" />
        <a-collapse ghost class="tm-more"><a-collapse-panel key="more" header="更多">
          <template v-if="moreSummary" #extra><span class="tm-more-extra">{{ moreSummary }}</span></template>
          <OotdMore v-if="outfitMode" :studio="studio" />
          <a-form v-else layout="vertical">
            <a-form-item v-if="lightOptions.length > 1" label="光线"><a-segmented v-model:value="light" :disabled="locked" :options="lightOptions" /></a-form-item>
            <a-form-item label="补充说明"><a-textarea v-model:value="note" :disabled="locked" :maxlength="200" show-count :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="例如：背景明亮一些" /></a-form-item>
          </a-form>
        </a-collapse-panel></a-collapse>
      </section>
    </main>

    <aside class="tm-bar">
      <p v-if="block" class="tm-block" role="status">{{ block }}</p>
      <div class="tm-bar-row">
        <a-button v-if="stepIndex > 0" size="large" :disabled="locked" @click="back">上一步</a-button>
        <a-button v-if="!isLast" type="primary" size="large" :disabled="!!block" @click="go(nextStep(steps, step))">下一步</a-button>
        <!-- 禁用的按钮收不到点击：外面这层接住，滚到第一个要处理的地方。 -->
        <span v-else-if="outfitMode" class="tm-go" @click="nudge"><a-button type="primary" size="large" :loading="studio.busy" :disabled="!!block || !!pending" @click="studio.prepare()">{{ imageActionLabel(billing.image) }}</a-button></span>
        <span v-else class="tm-go" @click="!pending && nudge()"><a-button type="primary" size="large" :loading="busy" :disabled="(!!block && !pending)" @click="generate">{{ pending ? '核对结果' : '生成 · 1 次' }}</a-button></span>
      </div>
      <p v-if="isLast && outfitMode" class="tm-cost">每张用 1 次图像额度 · 约 30 秒，可以先离开</p>
      <p v-else-if="isLast" class="tm-cost">与上身图共用次数
        <a-popover placement="top" trigger="click">
          <template #content><div class="tm-rules">生成一次用 1 次，与上身图共用。<br />发出后失败、取消或结果待确认，也会用掉 1 次，不自动返还。<br />图片可能与实物有差异，完成后请核对衣服细节。<br /><a @click="router.push('/help?article=08-creation')">了解更多</a></div></template>
          <a-button type="text" size="small" shape="circle" aria-label="次数规则"><QuestionCircleOutlined /></a-button>
        </a-popover>
      </p>
    </aside>
  </div>

  <CreationGarmentPicker v-model:open="pickerOpen" :selected-ids="selected.map(g => g.id)" :max="maxGarments" :locked="locked" @toggle="toggle" />
  <a-drawer :open="sheet === 'person'" :placement="wide ? 'right' : 'bottom'" :width="440" height="auto" title="谁来穿" root-class-name="studio-sheet" @close="sheet = ''">
    <ModelPicker v-if="studio.baselines.length" v-model="baselineId" :models="studio.baselines" />
    <div v-else class="tm-empty"><p>先上传一张全身照，生成你的形象，之后每次试穿都用它。</p><a-button type="primary" @click="router.push('/settings?section=personal')">设置我的形象</a-button><a-button v-if="!outfitMode && chooseEffect" type="link" :disabled="locked" @click="sheet = ''; go('effect')">换个不需要人物的效果</a-button></div>
  </a-drawer>
  <a-drawer :open="sheet === 'pose'" :placement="wide ? 'right' : 'bottom'" :width="480" height="min(82dvh, 760px)" title="姿势" root-class-name="studio-sheet" @close="sheet = ''">
    <PosePicker v-model="pose" :catalog="studio.poseCatalog" @changed="studio.loadPoses()" />
    <template #footer><a-button type="primary" block @click="sheet = ''">好了 · {{ studio.poseName }}</a-button></template>
  </a-drawer>
  <OotdConfirmModal :studio="studio" />
</template>

<style scoped>
.tm-skeleton { max-width: 640px; margin: 0 auto; }
.tm { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; max-width: 640px; margin: 0 auto; }
.tm-main { min-width: 0; }
.tm-progress { display: flex; align-items: center; gap: 12px; margin: 0 0 14px; }
.tm-progress :deep(.ant-progress) { flex: 1; margin: 0; line-height: 1; }
.tm-progress span { flex: none; font-size: 13px; color: var(--muted-strong); }
.tm-alert { margin-bottom: 12px; }
.tm-label { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
.tm-note { margin: 12px 0 0; font-size: 13px; color: var(--muted-strong); }
.tm-step > .tm-note:first-child, .tm-alert + .tm-note { margin: 0 0 8px; }
.tm-effects { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.tm-card.ant-btn { display: block; height: auto; padding: 0; white-space: normal; text-align: left; color: var(--ink); }
.tm-card-art { position: relative; display: grid; place-items: center; overflow: hidden; width: 100%; aspect-ratio: 3 / 4; border-radius: 10px; background: var(--surface-alt); border: 1px solid var(--line); color: var(--muted); font-size: 28px; }
.tm-card-art img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.tm-card.on .tm-card-art { outline: 2px solid var(--ink); outline-offset: 2px; }
.tm-card strong { display: block; margin-top: 8px; font-size: 14px; }
.tm-card small { display: block; margin-top: 2px; font-size: 12px; line-height: 1.5; color: var(--muted-strong); }
.tm-check { position: absolute; right: 8px; top: 8px; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: var(--action-bg); color: var(--action-fg); font-size: 12px; }
.tm-outfits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.tm-outfit { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
.tm-outfit:disabled { cursor: not-allowed; opacity: .6; }
.tm-outfit-media { display: block; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: var(--surface-alt); }
.tm-outfit.on .tm-outfit-media { box-shadow: 0 0 0 2px var(--ink); }
.tm-outfit:focus-visible { outline: none; }
.tm-outfit:focus-visible .tm-outfit-media { box-shadow: 0 0 0 2px var(--focus-ring); }
.tm-outfit b { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.tm-empty { display: grid; justify-items: center; gap: 12px; padding: 24px 8px; text-align: center; color: var(--muted); }
.tm-empty p { margin: 0; }
.tm-count { margin-bottom: 10px; font-size: 13px; color: var(--muted-strong); font-variant-numeric: tabular-nums; }
.tm-selected { display: flex; gap: 8px; overflow-x: auto; padding: 4px 4px 10px; margin: 0 -4px; }
.tm-chosen { position: relative; flex: 0 0 76px; height: 76px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-alt); }
.tm-chosen img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
.tm-remove.ant-btn { position: absolute; right: -6px; top: -6px; width: 22px; min-width: 22px; height: 22px; padding: 0; font-size: 10px; }
.tm-pick.ant-btn { height: 56px; margin-top: 4px; border-style: dashed; }
.tm-more { margin-top: 12px; }
.tm-more :deep(.ant-collapse-header) { padding-inline: 0 !important; }
.tm-more :deep(.ant-collapse-content-box) { padding-inline: 0 !important; }
.tm-more-extra { font-size: 13px; color: var(--muted); }
.tm-pair { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
.tm-tile { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
.tm-tile:disabled { cursor: not-allowed; }
.tm-tile-media { position: relative; display: grid; place-items: center; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 14px; background: var(--surface-alt); transition: box-shadow .2s ease; }
.tm-tile:hover .tm-tile-media, .tm-tile:focus-visible .tm-tile-media { box-shadow: 0 0 0 2px var(--ink); }
.tm-tile:focus-visible { outline: none; }
.tm-tile-media > img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.tm-tile.empty .tm-tile-media { box-shadow: inset 0 0 0 1.5px var(--line); background: transparent; }
.tm-tile-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; color: var(--muted); text-align: center; font-size: 26px; }
.tm-tile-empty b { font-size: 13px; font-weight: 500; }
.tm-tile-label { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 0 6px; padding: 0 2px; }
.tm-tile-label small { grid-column: 1 / -1; font-size: 12px; color: var(--muted); }
.tm-tile-label b { overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.tm-tile-label em { font-style: normal; font-size: 13px; color: var(--accent-strong); }
.tm-plus { display: grid; place-items: center; width: 28px; height: 28px; margin-bottom: 44px; border-radius: 50%; color: var(--muted); background: var(--surface-alt); font-size: 12px; }
.tm-bar { position: sticky; bottom: calc(var(--dock-space) + 4px); z-index: 5; display: grid; gap: 6px; padding: 12px; border-radius: 18px; background: var(--glass); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); box-shadow: 0 0 0 1px var(--line), 0 10px 30px -16px #00000040; }
.tm-bar-row { display: flex; gap: 10px; }
.tm-bar-row .ant-btn-primary { flex: 1; min-width: 0; }
.tm-go { display: flex; flex: 1; min-width: 0; }
.tm-go .ant-btn[disabled] { pointer-events: none; }
.tm-bar .ant-btn-lg { height: 50px; font-size: 16px; }
.tm-block { margin: 0; text-align: center; font-size: 13px; color: var(--muted-strong); }
.tm-cost { margin: 0; text-align: center; font-size: 12px; color: var(--muted-strong); }
.tm-rules { max-width: 260px; font-size: 13px; line-height: 1.7; }
@media (min-width: 768px) { .tm-effects { grid-template-columns: repeat(3, minmax(0, 1fr)); } .tm-outfits { grid-template-columns: repeat(3, minmax(0, 1fr)); } .tm-pair { gap: 16px; } }
@media (min-width: 1024px) {
  .tm { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; gap: 24px; max-width: 1080px; }
  .tm-pair { max-width: 480px; margin: 0 auto; }
  .tm-bar { position: sticky; top: 24px; bottom: auto; padding: 18px; background: var(--surface); backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: 0 0 0 1px var(--line); }
  .tm-bar-row { flex-direction: column-reverse; }
  .tm-go { flex: none; }
}
@media (prefers-reduced-motion: reduce) { .tm-tile-media { transition: none; } }
</style>
<style>
/* 底部（桌面右侧）选择面板：圆角顶边，内容区留白（原上身图页）。 */
.studio-sheet .ant-drawer-content { border-radius: 20px 20px 0 0; }
.studio-sheet .ant-drawer-right .ant-drawer-content, .studio-sheet.ant-drawer-right .ant-drawer-content { border-radius: 0; }
.studio-sheet .ant-drawer-header { border-bottom: 0; padding-bottom: 4px; }
</style>
