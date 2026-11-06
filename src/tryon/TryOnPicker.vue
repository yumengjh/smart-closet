<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckOutlined, PlusOutlined, ExpandOutlined, CameraOutlined, CloseOutlined } from '@ant-design/icons-vue'
import type { Outfit } from '../domain/outfit'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import { thumbUrl } from '../services/urls'
import { mediaUrl, type Candidate, type Selection } from './api'
import { WEAR_GROUPS, WEAR_OPTIONS } from './context'
import { loadWantedLabel, wantedLabel } from '../wardrobe/wanted'
void loadWantedLabel()
const props = defineProps<{
  garments: Candidate[]; outfits: Outfit[]; selected: Selection[]; search: string; tab: string
  temporary: { id: string; imageUrl: string; role?: string }[]; blocked: boolean; busyId: string | null
  /** 当前组合里每件衣物按分类自动得到的位置（来自已准备好的组合），用作“自动”选项的说明。 */
  autoRoles?: Record<string, string | null | undefined>
  selectedOutfit: string | null; uploading: boolean; error: string; canUseLatest: boolean
  /** 正在压缩 / 正在上传；只在上传进行中显示。 */
  uploadPhase?: string
  chooseUpload: (file: File) => Promise<boolean>
  popupHost?: () => HTMLElement
}>()
const emit = defineEmits<{ 'update:search': [value: string]; 'update:tab': [value: string]; toggle: [item: Selection]; outfit: [id: string]; more: []; latest: []; clear: []; role: [id: string, role: string | undefined] }>()
const preview = ref<Outfit | null>(null)
const has = (id: string) => props.selected.some(s => s.id === id)
const garments = computed(() => props.garments.filter(g => (g.name || '').toLocaleLowerCase().includes(props.search.trim().toLocaleLowerCase())))
const garmentItems = (o: Outfit) => o.scene.elements.filter(i => i.garmentId)
function choose(o: Outfit) { preview.value = null; emit('outfit', o.id) }
const roleLabel = (role?: string | null) => WEAR_OPTIONS.find(o => o.value === role)?.label
const AUTO = '__auto__'
function rows() {
  return props.selected.map(s => {
    const garment = s.type === 'GARMENT' ? props.garments.find(g => g.id === s.id) : undefined, temp = s.type === 'TEMPORARY' ? props.temporary.find(t => t.id === s.id) : undefined
    const auto = roleLabel(props.autoRoles?.[s.id])
    const options = s.type === 'GARMENT' ? [{ value: AUTO, label: auto ? `按分类：${auto}` : '按分类自动' }, ...WEAR_GROUPS] : WEAR_GROUPS
    return { s, name: garment?.name || (temp ? '自定义衣物' : '衣物'), image: garment ? thumbUrl(garment.imageUrl, 160) : temp ? mediaUrl(temp.imageUrl) : undefined, options, value: s.role || (s.type === 'GARMENT' ? AUTO : undefined) }
  })
}
/** 能在本机转码的 HEIC / WebP 会转成 JPEG 或 PNG 再上传；转不了的仍由服务端拒绝并提示。 */
const UPLOAD_ACCEPT = 'image/png,image/jpeg,image/heic,image/heif,image/webp'
function pickRole(id: string, value: unknown) { emit('role', id, value === AUTO || typeof value !== 'string' ? undefined : value) }
</script>
<template>
  <div class="tryon-material-picker">
    <a-segmented :value="tab" :options="['衣柜','已存搭配','临时上传']" block @change="(value: string | number) => emit('update:tab', String(value))" />
    <section v-if="selected.length" class="picker-current" aria-label="当前组合与穿戴位置">
      <div class="picker-current-head"><strong>已选 {{ selected.length }} 件</strong><a-button type="link" size="small" :disabled="blocked || !!busyId" @click="emit('clear')">全部清空</a-button></div>
      <p class="picker-note">位置不对时在这里改，例如把发箍设为头饰</p>
      <div v-for="r in rows()" :key="r.s.id" class="picker-current-row">
        <img v-if="r.image" :src="r.image" alt="" />
        <span>{{ r.name }}</span>
        <a-select size="small" show-search option-filter-prop="label" :value="r.value" :options="r.options" :disabled="blocked || !!busyId" placeholder="选择穿戴位置" :status="r.value ? undefined : 'warning'" :get-popup-container="popupHost" :aria-label="`${r.name}的穿戴位置`" @change="(v: unknown) => pickRole(r.s.id, v)" />
        <a-button type="text" size="small" class="picker-remove" :disabled="blocked || !!busyId" :aria-label="`移除：${r.name}`" @click="emit('toggle', r.s)"><CloseOutlined /></a-button>
      </div>
    </section>
    <a-alert v-if="error" type="warning" show-icon :message="error"><template #action><a-button v-if="canUseLatest" size="small" :loading="!!busyId" @click="emit('latest')">使用最新成品</a-button></template></a-alert>
    <template v-if="tab === '衣柜'">
      <a-input :value="search" placeholder="查找衣柜成品" allow-clear @update:value="(value: string) => emit('update:search', value)" />
      <p class="picker-note">选择当前已完成处理的成品图，可自由组合。</p>
      <a-empty v-if="!garments.length" description="暂无可选成品，可先完成处理或临时上传" />
      <div class="picker-garments"><a-button v-for="g in garments" :key="g.id" class="picker-garment" :class="{ selected: has(g.id) }" :disabled="!g.ready || blocked || !!busyId" :aria-pressed="has(g.id)" :title="g.reason || g.name" @click="emit('toggle', { type:'GARMENT', id:g.id, revision:g.revision, assetId:g.assetId })"><img v-if="g.ready" :src="thumbUrl(g.imageUrl, 320)" :alt="g.name || '衣物成品'" loading="lazy" decoding="async" /><span v-else class="picker-unready">请先完成处理</span><span>{{ g.name || '衣物' }}</span><em v-if="g.wanted" class="picker-wanted">{{ wantedLabel }}</em><CheckOutlined v-if="has(g.id)" class="picker-check" /></a-button></div>
      <a-button block @click="emit('more')">加载更多衣物</a-button>
    </template>
    <template v-else-if="tab === '已存搭配'">
      <p class="picker-note">先看组合，再选一套试穿。选中后仍可增删单件。</p>
      <a-empty v-if="!outfits.length" description="还没有已保存搭配" />
      <div class="picker-outfits"><article v-for="o in outfits" :key="o.id" class="picker-outfit" :class="{ selected: selectedOutfit === o.id }">
        <a-button class="picker-outfit-choose" :disabled="blocked || !!busyId && busyId !== o.id || !garmentItems(o).length" :loading="busyId === o.id" :aria-pressed="selectedOutfit === o.id" :aria-label="`选择搭配：${o.name}`" @click="choose(o)"><OutfitThumbnail :scene="o.scene" :title="o.name" /><strong>{{ o.name }}</strong><span>{{ garmentItems(o).length }} 件衣物 <CheckOutlined v-if="selectedOutfit === o.id" /></span></a-button>
        <a-button type="text" class="picker-preview" :aria-label="`放大查看搭配：${o.name}`" @click="preview = o"><ExpandOutlined /> 放大查看</a-button>
      </article></div>
    </template>
    <template v-else>
      <p class="picker-note">上传会先停止试穿。你可以选择入柜，或仅在当前页面使用。</p>
      <div class="picker-upload-row">
        <a-upload :accept="UPLOAD_ACCEPT" :show-upload-list="false" :before-upload="chooseUpload" :disabled="uploading"><a-button block :loading="uploading"><PlusOutlined v-if="!uploading" /> {{ uploading && uploadPhase ? uploadPhase : '上传衣物照片' }}</a-button></a-upload>
        <a-upload accept="image/*" capture="environment" :show-upload-list="false" :before-upload="chooseUpload" :disabled="uploading"><a-button block :disabled="uploading"><CameraOutlined /> 拍一张</a-button></a-upload>
      </div>
      <p class="picker-note">照片会先在本机缩小到 1024 像素再上传，参考图用不到更高的清晰度。</p>
      <p class="picker-note">仅本页使用的衣物从上传起七天删除，刷新或离开后不恢复。</p>
      <div class="picker-garments"><a-button v-for="t in temporary" :key="t.id" class="picker-garment" :class="{selected:has(t.id)}" :disabled="blocked || !!busyId" @click="emit('toggle',{type:'TEMPORARY',id:t.id,role:t.role})"><img :src="mediaUrl(t.imageUrl)" alt="临时衣物" /><span>{{ roleLabel(t.role) || '自定义衣物' }}</span><CheckOutlined v-if="has(t.id)" class="picker-check" /></a-button></div>
    </template>
    <a-modal :open="!!preview" :title="preview?.name" :width="540" :footer="null" :get-container="popupHost" @cancel="preview=null"><template v-if="preview"><OutfitThumbnail class="picker-large-preview" :scene="preview.scene" :title="preview.name" :resolution="480" /><p class="picker-note">{{ garmentItems(preview).map(i=>i.garmentLabel).filter(Boolean).join('、') }}</p><p v-if="garmentItems(preview).some(i=>i.imageChanged)" class="picker-note">其中有衣物成品图已更新，选择后会请你确认。</p><a-button type="primary" block size="large" :disabled="blocked || !garmentItems(preview).length" @click="choose(preview)">使用这套搭配</a-button></template></a-modal>
  </div>
</template>
<style scoped>
.tryon-material-picker{display:flex;flex-direction:column;gap:14px;min-width:0}.picker-note{font-size:13px;line-height:1.7;color:var(--muted-strong);margin:0}.picker-garments,.picker-outfits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.picker-garment.ant-btn{position:relative;height:auto;min-height:150px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px;white-space:normal;line-height:1.5;overflow:hidden}.picker-garment img{width:100%;height:112px;object-fit:contain;background:var(--surface-alt);border-radius:6px}.picker-unready{height:112px;display:grid;place-items:center;font-size:12px;color:var(--muted-strong)}.picker-garment.selected,.picker-outfit.selected{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.picker-current{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--line);border-radius:var(--radius-md);background:var(--surface-alt)}.picker-current-head{display:flex;align-items:center;justify-content:space-between;font-size:13px}.picker-current-head .ant-btn{padding:0 4px}.picker-current-row{display:grid;grid-template-columns:36px minmax(0,1fr) 140px 28px;align-items:center;gap:8px}.picker-remove.ant-btn{width:28px;padding:0;color:var(--muted-strong)}.picker-current-row img{width:36px;height:36px;object-fit:contain;background:var(--surface);border-radius:6px}.picker-current-row>span{overflow:hidden;font-size:13px;text-overflow:ellipsis;white-space:nowrap;grid-column:2}.picker-current-row>img+span{grid-column:auto}.picker-wanted{position:absolute;top:8px;left:8px;padding:0 6px;border-radius:999px;font-size:11px;font-style:normal;line-height:18px;color:var(--accent-strong);background:var(--accent-soft)}.picker-check{position:absolute;top:8px;right:8px;background:var(--accent);color:white;border-radius:50%;padding:4px}.picker-outfit{border:1px solid var(--line);border-radius:12px;overflow:hidden}.picker-outfit-choose.ant-btn{width:100%;height:auto;padding:0 0 12px;display:flex;flex-direction:column;align-items:stretch;gap:8px;border:0;border-radius:0;white-space:normal;text-align:left}.picker-outfit-choose :deep(.ant-btn-loading-icon){position:absolute;inset:40% 0 auto;z-index:1;text-align:center}.picker-outfit-choose strong,.picker-outfit-choose>span{padding:0 10px}.picker-outfit-choose strong{font-size:14px;line-height:1.5}.picker-outfit-choose>span{font-size:12px;color:var(--muted-strong)}.picker-outfit-choose :deep(.outfit-thumbnail){width:100%;aspect-ratio:4/5;overflow:hidden;background:var(--surface-alt)}.picker-outfit-choose :deep(canvas){display:block;width:100%;height:100%;object-fit:contain}.picker-preview.ant-btn{width:100%;min-height:44px;border-top:1px solid var(--line);border-radius:0;font-size:13px}.picker-large-preview{height:min(55dvh,520px);display:flex;justify-content:center;background:var(--surface-alt);margin-bottom:16px}.picker-large-preview :deep(canvas){max-width:100%;max-height:100%;width:auto;height:100%;object-fit:contain}.picker-upload-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.picker-upload-row :deep(.ant-upload-wrapper){display:block;min-width:0}.picker-upload-row :deep(.ant-upload){width:100%}@media(max-width:380px){.picker-garments,.picker-outfits{gap:8px}.picker-outfit-choose strong{font-size:13px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
