<script setup lang="ts">
// 搭配编辑器里的“穿搭检查”（server 设计 2026-11-21 第 5 节）：与“做张图”同一套部位清单（PartList），
// 打开即查、改动后防抖重查；可以这次不穿、回答问题、选配饰位置。检查只看能不能做成上身图，自由画板不受限制。
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { OutfitScene } from '../domain/outfit'
import { thumbUrl } from '../services/urls'
import { useWearCheck } from '../ootd/useWearCheck'
import { reviewPassed, type FitGarment } from '../ootd/part-list'
import PartList from '../ootd/PartList.vue'

const props = defineProps<{ open: boolean; scene: OutfitScene }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const router = useRouter()
const selected = ref<string[]>([]), roles = ref<Record<string, string>>({})
const items = computed(() => [...new Map(props.scene.elements.filter(e => e.kind !== 'PERSON_PART').map(e => [e.garmentId, e])).values()])
const garments = computed<FitGarment[]>(() => items.value.map(item => ({ id: item.garmentId, label: item.garmentLabel, thumb: thumbUrl(item.assetUrl, 120) || null })))
// 每次打开从整套开始（同步重置，让紧接着的那次检查用的是这套的全部单品）。
watch(() => props.open, open => { if (open) { selected.value = items.value.map(item => item.garmentId); roles.value = {} } }, { flush: 'sync' })
const check = useWearCheck(() => ({ scene: props.scene, selectedGarmentIds: selected.value, wearRoles: roles.value }), () => props.open)
const review = check.review, checkError = check.error
const passed = computed(() => reviewPassed(review.value))
function close() { emit('update:open', false) }
function detail(id: string) { close(); void router.push(`/garment/${encodeURIComponent(id)}`) }
function retry() { void check.run().catch(() => {}) }
</script>
<template>
  <a-modal :open="open" title="穿搭检查" :footer="null" :width="560" @cancel="close">
    <p class="or-intro">看看这套能不能做成上身图，检查不用次数。</p>
    <PartList v-model:selected="selected" v-model:wear-roles="roles" :review="review" :garments="garments" :error="checkError" details @fix="close" @detail="detail" @retry="retry" />
    <p v-if="review" class="or-foot">{{ passed ? '可以做上身图了，合身程度和效果仍以实物为准。' : '按上面改好再做上身图。自由画板仍可继续编辑。' }}</p>
  </a-modal>
</template>
<style scoped>
.or-intro { margin: 0 0 4px; font-size: 13px; color: var(--muted-strong); }
.or-foot { margin: 14px 0 0; font-size: 12px; color: var(--muted); }
</style>
