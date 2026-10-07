<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { platformRequest, type Review } from '../services/platform'
import type { OutfitScene } from '../domain/outfit'
const props = defineProps<{ open: boolean; scene: OutfitScene }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const accessoryOptions=[{value:'ACCESSORY:EAR',label:'耳部'},{value:'ACCESSORY:NECK',label:'颈部'},{value:'ACCESSORY:WRIST',label:'手腕'},{value:'ACCESSORY:HAND_LEFT',label:'左手'},{value:'ACCESSORY:HAND_RIGHT',label:'右手'},{value:'ACCESSORY:TIE',label:'领带'}]
const review = ref<Review | null>(null); const loading = ref(false); const error = ref('')
const selected = ref<string[]>([]); const multiLayer = ref(false); const roles = ref<Record<string, string>>({})
const items = computed(() => [...new Map(props.scene.elements.filter(e => e.kind !== 'PERSON_PART').map(e => [e.garmentId, e])).values()])
async function check() { loading.value = true; error.value = ''; try { review.value = await platformRequest<Review>('/api/outfit-reviews', 'POST', { scene: props.scene, selectedGarmentIds: selected.value, multiLayer: multiLayer.value, wearRoles: roles.value }) } catch (e) { error.value = String(e) } finally { loading.value = false } }
watch(() => props.open, v => { if (v) { selected.value = items.value.map(i => i.garmentId); roles.value = {}; multiLayer.value = false; void check() } })
</script>
<template>
  <a-modal :open="open" title="全身穿搭检查" :footer="null" :width="760" @cancel="emit('update:open', false)">
    <p>选出本次一名人物穿的一套衣物。复制贴纸只计穿一次，展示素材可排除。检查使用已有资料，不消耗 AI 图像额度。</p>
    <a-checkbox-group v-model:value="selected" style="display:flex;flex-direction:column;gap:8px"><a-checkbox v-for="item in items" :key="item.garmentId" :value="item.garmentId">{{ item.garmentLabel }}</a-checkbox></a-checkbox-group>
    <a-space wrap style="margin:16px 0"><a-checkbox v-model:checked="multiLayer">明确使用多层穿法</a-checkbox><a-button :loading="loading" @click="check">重新检查</a-button></a-space>
    <p v-if="multiLayer">最多打底＋主体＋外搭，双外套禁止。两层之间都需核对版型、厚薄和穿着用途。</p>
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <a-skeleton v-if="loading" active />
    <template v-else-if="review">
      <a-alert v-for="issue in review.blockers" :key="issue.message" type="error" :message="issue.message" :description="issue.action" show-icon style="margin-bottom:8px" />
      <a-alert v-for="issue in review.warnings" :key="issue.code" type="warning" :message="issue.message" show-icon style="margin-bottom:8px" />
      <div class="wear-distribution"><svg viewBox="0 0 120 260" role="img" aria-label="全身穿搭区域示意"><circle cx="60" cy="28" r="18" /><path d="M35 58 Q60 48 85 58 L92 143 H28 Z M35 143 L30 235 H51 L60 160 L69 235 H90 L85 143 M35 63 L12 135 M85 63 L108 135" /></svg><dl><div v-for="slot in review.slots" :key="slot.role" class="wear-slot"><dt>{{ slot.label }} <a-tag :color="slot.state === 'CONFLICT' || slot.state === 'UNKNOWN' ? 'error' : slot.state === 'PRESENT' ? 'success' : undefined">{{ { PRESENT: '已有', MISSING: '缺少', CONFLICT: '冲突', UNKNOWN: '资料未确认' }[slot.state] }}</a-tag></dt><dd v-if="!slot.items.length">{{ slot.role === 'TOP' || slot.role === 'BOTTOM' ? '连体主体可替代上下装' : '可按需添加' }}</dd><dd v-for="item in slot.items" :key="item.garmentId">{{ item.label }} <a-select v-if="multiLayer && ['TOP','INNER'].includes(item.role)" v-model:value="roles[item.garmentId]" style="min-width:110px" :options="[{value:'TOP',label:'主体上装'},{value:'INNER',label:'打底内层'}]" placeholder="选择穿法" /><a-select v-if="item.role==='ACCESSORY'" v-model:value="roles[item.garmentId]" style="min-width:120px" :options="accessoryOptions" placeholder="确认佩戴位置" /> <RouterLink :to="`/garment/${item.garmentId}`" @click="emit('update:open', false)">核对资料</RouterLink></dd></div></dl></div>
      <p class="muted">{{ review.blockers.length ? '请修正后再生成 OOTD。自由画板仍可继续编辑。' : '结构检查通过；实际合身程度与生成效果仍需核对。' }}</p>
    </template>
  </a-modal>
</template>
<style scoped>.wear-distribution{display:flex;gap:24px;margin-top:20px}.wear-distribution svg{width:90px;flex-shrink:0;align-self:flex-start;fill:var(--surface-secondary,#eee);stroke:var(--text-muted,#888);stroke-width:3}.wear-distribution dl{flex:1;min-width:0;margin:0}.wear-slot{padding:8px 0;border-bottom:1px solid var(--border-color,#ddd)}dt{font-weight:600}dd{margin:6px 0;font-size:13px;overflow-wrap:anywhere}dd a{margin-left:12px}@media(max-width:480px){.wear-distribution{gap:12px}.wear-distribution svg{width:56px}}</style>
