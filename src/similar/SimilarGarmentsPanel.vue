<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { mediaUrl } from '../services/urls'
import { similarApi, LEVEL_LABELS, type SimilarView } from './api'

/** 相似的衣物 on the garment page: hints only, never merges or blocks (design S2). */
const props = defineProps<{ garmentId: string; draft?: boolean }>()
const { message } = App.useApp()
const view = ref<SimilarView | null>(null); const loading = ref(true); const error = ref(''); const busy = ref('')
const duplicate = computed(() => view.value?.items.find(i => i.level === 'DUPLICATE') || null)
async function load() {
  loading.value = true; error.value = ''
  try { view.value = await similarApi.similar(props.garmentId) }
  catch (e) { error.value = e instanceof Error ? e.message : '相似衣物暂时无法加载。' }
  finally { loading.value = false }
}
async function dismiss(other: string) {
  busy.value = other
  try { await similarApi.dismiss(props.garmentId, other); message.success('已记住：这两件不是重复。'); await load() }
  catch (e) { message.error(e instanceof Error ? e.message : '操作失败。') }
  finally { busy.value = '' }
}
onMounted(load); watch(() => props.garmentId, load)
</script>
<template>
  <section v-if="!loading && (view?.items.length || error)" class="garment-surface similar-panel" aria-label="相似的衣物">
    <div class="section-heading"><h2>相似的衣物</h2><span class="muted">按颜色、轮廓、外观与描述比对，本地计算</span></div>
    <a-alert v-if="error" type="warning" show-icon :message="error" />
    <a-alert v-if="duplicate" type="warning" show-icon :message="draft ? '衣柜里已有一件几乎一样的，确认不是重复再入柜' : '衣柜里有一件几乎一样的，可能重复录入了'">
      <template #description>
        <RouterLink :to="`/garment/${duplicate.id}`">{{ duplicate.name }}</RouterLink>：{{ duplicate.reasons.join('，') }}
        <a-button type="link" size="small" :loading="busy === duplicate.id" @click="dismiss(duplicate.id)">不是重复</a-button>
      </template>
    </a-alert>
    <ul class="similar-list">
      <li v-for="item in view?.items" :key="item.id">
        <RouterLink :to="`/garment/${item.id}`" class="similar-thumb"><img v-if="item.displayUrl" :src="mediaUrl(item.displayUrl)" :alt="item.name" /></RouterLink>
        <div>
          <RouterLink :to="`/garment/${item.id}`"><strong>{{ item.name }}</strong></RouterLink>
          <a-tag v-if="item.level" :color="LEVEL_LABELS[item.level].color">{{ LEVEL_LABELS[item.level].label }}</a-tag>
          <p class="muted">{{ item.reasons.join('，') || '整体相近' }}</p>
        </div>
      </li>
    </ul>
    <p v-if="view && !view.ready.image" class="muted">这件的图片指纹还在后台计算，稍后刷新会更准。</p>
  </section>
</template>
<style scoped>
.similar-panel { display: grid; gap: 10px; }
.similar-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.similar-list li { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 10px; align-items: center; }
.similar-thumb { width: 56px; height: 56px; border-radius: 8px; overflow: hidden; display: grid; place-items: center; background: var(--surface-muted, rgba(0,0,0,.04)); }
.similar-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
.similar-list p { margin: 2px 0 0; font-size: 12px; }
</style>
