<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { SwapOutlined } from '@ant-design/icons-vue'
import { playSound } from '../services/sound'
import { recommendApi } from './api'
import GarmentThumb from './GarmentThumb.vue'
import type { RecommendedGarment, RecommendedOutfit, SwapView } from './types'

/** 换一件 (design 8.2): same-position alternatives with the score change; adopting re-scores the whole outfit. */
const props = defineProps<{ runId: string; outfit: RecommendedOutfit; garment: RecommendedGarment }>()
const emit = defineEmits<{ adopted: [outfit: RecommendedOutfit] }>()
const { message } = App.useApp()
const compact = ref(window.matchMedia('(max-width: 767px)').matches)
const media = window.matchMedia('(max-width: 767px)'); const onMedia = () => { compact.value = media.matches }
onMounted(() => media.addEventListener('change', onMedia)); onBeforeUnmount(() => media.removeEventListener('change', onMedia))
const open = ref(false); const loading = ref(false); const error = ref(''); const data = ref<SwapView | null>(null); const adopting = ref('')
async function show(visible = true) {
  open.value = visible
  if (!visible || data.value) return
  loading.value = true; error.value = ''
  try { data.value = await recommendApi.swap(props.runId, props.outfit.key, props.garment.id) }
  catch (e) { error.value = e instanceof Error ? e.message : '暂时找不到替代品。' }
  finally { loading.value = false }
}
async function adopt(outfit: RecommendedOutfit, replacementId: string) {
  adopting.value = replacementId
  try {
    const adopted = await recommendApi.adopt(props.runId, outfit.garments.map(g => g.id))
    // The replaced garment is a weak, outfit-only signal (not "never this garment").
    recommendApi.signal({ kind: 'SWAP_OUT', logId: props.outfit.logId || undefined, garmentId: props.garment.id })
    open.value = false; playSound('success'); emit('adopted', adopted)
  } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '没能换成这件。') }
  finally { adopting.value = '' }
}
</script>
<template>
  <a-popover v-if="!compact" :open="open" trigger="click" placement="left" :title="`换掉「${garment.name}」`" overlay-class-name="recommend-swap-popover" @open-change="show">
    <template #content><div class="recommend-swap-body">
      <a-skeleton v-if="loading" active :title="false" :paragraph="{ rows: 3 }" />
      <a-alert v-else-if="error" type="warning" show-icon :message="error" />
      <a-empty v-else-if="data && !data.alternatives.length" description="同一位置没有其他合适的衣物" />
      <ul v-else-if="data" class="recommend-swap-options">
        <li v-for="alt in data.alternatives" :key="alt.garment.id"><GarmentThumb :garment-id="alt.garment.id" :alt="alt.garment.name" :size="44" /><div><strong>{{ alt.garment.name }}</strong><small>换后 {{ Math.round(alt.outfit.score) }} 分</small></div><a-tag :color="alt.delta >= 0 ? 'green' : 'orange'">{{ alt.delta > 0 ? '+' : '' }}{{ alt.delta }}</a-tag><a-button size="small" type="primary" :loading="adopting === alt.garment.id" @click="adopt(alt.outfit, alt.garment.id)">采用</a-button></li>
      </ul>
    </div></template>
    <a-button size="small" type="link" class="recommend-swap-button" :aria-label="`换一件${garment.name}`"><SwapOutlined />换一件</a-button>
  </a-popover>
  <template v-else>
    <a-button size="small" type="link" class="recommend-swap-button" :aria-label="`换一件${garment.name}`" @click="show(true)"><SwapOutlined />换一件</a-button>
    <a-drawer :open="open" placement="bottom" height="min(70dvh, 560px)" :title="`换掉「${garment.name}」`" @close="open = false">
      <a-skeleton v-if="loading" active :title="false" :paragraph="{ rows: 3 }" />
      <a-alert v-else-if="error" type="warning" show-icon :message="error" />
      <a-empty v-else-if="data && !data.alternatives.length" description="同一位置没有其他合适的衣物" />
      <ul v-else-if="data" class="recommend-swap-options">
        <li v-for="alt in data.alternatives" :key="alt.garment.id"><GarmentThumb :garment-id="alt.garment.id" :alt="alt.garment.name" :size="52" /><div><strong>{{ alt.garment.name }}</strong><small>换后 {{ Math.round(alt.outfit.score) }} 分</small></div><a-tag :color="alt.delta >= 0 ? 'green' : 'orange'">{{ alt.delta > 0 ? '+' : '' }}{{ alt.delta }}</a-tag><a-button size="small" type="primary" :loading="adopting === alt.garment.id" @click="adopt(alt.outfit, alt.garment.id)">采用</a-button></li>
      </ul>
    </a-drawer>
  </template>
</template>
