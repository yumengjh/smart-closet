<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckOutlined, PlusOutlined, ExpandOutlined } from '@ant-design/icons-vue'
import type { Outfit } from '../domain/outfit'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import { thumbUrl } from '../services/urls'
import { mediaUrl, type Candidate, type Selection } from './api'
const props = defineProps<{
  garments: Candidate[]; outfits: Outfit[]; selected: Selection[]; search: string; tab: string
  temporary: { id: string; imageUrl: string }[]; blocked: boolean; busyId: string | null
  selectedOutfit: string | null; uploading: boolean; error: string; canUseLatest: boolean
  chooseUpload: (file: File) => Promise<boolean>
}>()
const emit = defineEmits<{ 'update:search': [value: string]; 'update:tab': [value: string]; toggle: [item: Selection]; outfit: [id: string]; more: []; latest: [] }>()
const preview = ref<Outfit | null>(null)
const has = (id: string) => props.selected.some(s => s.id === id)
const garments = computed(() => props.garments.filter(g => (g.name || '').toLocaleLowerCase().includes(props.search.trim().toLocaleLowerCase())))
const garmentItems = (o: Outfit) => o.scene.elements.filter(i => i.garmentId)
function choose(o: Outfit) { preview.value = null; emit('outfit', o.id) }
</script>
<template>
  <div class="tryon-material-picker">
    <a-segmented :value="tab" :options="['衣柜','已存搭配','临时上传']" block @change="(value: string | number) => emit('update:tab', String(value))" />
    <a-alert v-if="error" type="warning" show-icon :message="error"><template #action><a-button v-if="canUseLatest" size="small" :loading="!!busyId" @click="emit('latest')">使用最新成品</a-button></template></a-alert>
    <template v-if="tab === '衣柜'">
      <a-input :value="search" placeholder="查找衣柜成品" allow-clear @update:value="(value: string) => emit('update:search', value)" />
      <p class="picker-note">选择当前已完成处理的成品图，可自由组合。</p>
      <a-empty v-if="!garments.length" description="暂无可选成品，可先完成处理或临时上传" />
      <div class="picker-garments"><a-button v-for="g in garments" :key="g.id" class="picker-garment" :class="{ selected: has(g.id) }" :disabled="!g.ready || blocked || !!busyId" :aria-pressed="has(g.id)" :title="g.reason || g.name" @click="emit('toggle', { type:'GARMENT', id:g.id, revision:g.revision, assetId:g.assetId })"><img v-if="g.ready" :src="thumbUrl(g.imageUrl, 320)" :alt="g.name || '衣物成品'" loading="lazy" decoding="async" /><span v-else class="picker-unready">请先完成处理</span><span>{{ g.name || '衣物' }}</span><CheckOutlined v-if="has(g.id)" class="picker-check" /></a-button></div>
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
      <a-upload accept="image/png,image/jpeg" :show-upload-list="false" :before-upload="chooseUpload"><a-button block :loading="uploading"><PlusOutlined /> 上传衣物照片</a-button></a-upload>
      <p class="picker-note">仅本页使用的衣物从上传起七天删除，刷新或离开后不恢复。</p>
      <div class="picker-garments"><a-button v-for="t in temporary" :key="t.id" class="picker-garment" :class="{selected:has(t.id)}" :disabled="blocked || !!busyId" @click="emit('toggle',{type:'TEMPORARY',id:t.id})"><img :src="mediaUrl(t.imageUrl)" alt="临时衣物" /><span>自定义衣物</span><CheckOutlined v-if="has(t.id)" class="picker-check" /></a-button></div>
    </template>
    <a-modal :open="!!preview" :title="preview?.name" :width="540" :footer="null" @cancel="preview=null"><template v-if="preview"><OutfitThumbnail class="picker-large-preview" :scene="preview.scene" :title="preview.name" :resolution="480" /><p class="picker-note">{{ garmentItems(preview).map(i=>i.garmentLabel).filter(Boolean).join('、') }}</p><p v-if="garmentItems(preview).some(i=>i.imageChanged)" class="picker-note">其中有衣物成品图已更新，选择后会请你确认。</p><a-button type="primary" block size="large" :disabled="blocked || !garmentItems(preview).length" @click="choose(preview)">使用这套搭配</a-button></template></a-modal>
  </div>
</template>
<style scoped>
.tryon-material-picker{display:flex;flex-direction:column;gap:14px;min-width:0}.picker-note{font-size:13px;line-height:1.7;color:var(--muted-strong);margin:0}.picker-garments,.picker-outfits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.picker-garment.ant-btn{position:relative;height:auto;min-height:150px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px;white-space:normal;line-height:1.5;overflow:hidden}.picker-garment img{width:100%;height:112px;object-fit:contain;background:var(--surface-alt);border-radius:6px}.picker-unready{height:112px;display:grid;place-items:center;font-size:12px;color:var(--muted-strong)}.picker-garment.selected,.picker-outfit.selected{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.picker-check{position:absolute;top:8px;right:8px;background:var(--accent);color:white;border-radius:50%;padding:4px}.picker-outfit{border:1px solid var(--line);border-radius:12px;overflow:hidden}.picker-outfit-choose.ant-btn{width:100%;height:auto;padding:0 0 12px;display:flex;flex-direction:column;align-items:stretch;gap:8px;border:0;border-radius:0;white-space:normal;text-align:left}.picker-outfit-choose :deep(.ant-btn-loading-icon){position:absolute;inset:40% 0 auto;z-index:1;text-align:center}.picker-outfit-choose strong,.picker-outfit-choose>span{padding:0 10px}.picker-outfit-choose strong{font-size:14px;line-height:1.5}.picker-outfit-choose>span{font-size:12px;color:var(--muted-strong)}.picker-outfit-choose :deep(.outfit-thumbnail){width:100%;aspect-ratio:4/5;overflow:hidden;background:var(--surface-alt)}.picker-outfit-choose :deep(canvas){display:block;width:100%;height:100%;object-fit:contain}.picker-preview.ant-btn{width:100%;min-height:44px;border-top:1px solid var(--line);border-radius:0;font-size:13px}.picker-large-preview{height:min(55dvh,520px);display:flex;justify-content:center;background:var(--surface-alt);margin-bottom:16px}.picker-large-preview :deep(canvas){max-width:100%;max-height:100%;width:auto;height:100%;object-fit:contain}.tryon-material-picker>.ant-upload-wrapper :deep(.ant-upload){width:100%}@media(max-width:380px){.picker-garments,.picker-outfits{gap:8px}.picker-outfit-choose strong{font-size:13px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
