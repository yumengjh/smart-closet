<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { thumbUrl } from '../services/urls'
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
    <header class="similar-head"><h2>相似的衣物</h2><p class="muted">按颜色、轮廓、外观与描述比对，本地计算</p></header>
    <a-alert v-if="error" type="warning" show-icon :message="error" />
    <a-alert v-if="duplicate" type="warning" show-icon :message="draft ? '衣柜里已有一件几乎一样的，确认不是重复再入柜' : '衣柜里有一件几乎一样的，可能重复录入了'">
      <template #description>
        <RouterLink :to="`/garment/${duplicate.id}`">{{ duplicate.name }}</RouterLink>：{{ duplicate.reasons.join('，') }}
        <a-button type="link" size="small" :loading="busy === duplicate.id" @click="dismiss(duplicate.id)">不是重复</a-button>
      </template>
    </a-alert>
    <ul class="similar-list">
      <li v-for="item in view?.items" :key="item.id">
        <RouterLink :to="`/garment/${item.id}`" class="similar-item">
          <span class="similar-thumb"><img v-if="item.displayUrl" :src="thumbUrl(item.displayUrl, 320)" :alt="item.name" loading="lazy" decoding="async" /></span>
          <span class="similar-copy">
            <span class="similar-title"><strong>{{ item.name }}</strong><a-tag v-if="item.level" :color="LEVEL_LABELS[item.level].color">{{ LEVEL_LABELS[item.level].label }}</a-tag></span>
            <span class="similar-reasons"><em v-for="reason in (item.reasons.length ? item.reasons : ['整体相近']).slice(0, 3)" :key="reason">{{ reason }}</em></span>
          </span>
        </RouterLink>
      </li>
    </ul>
    <p v-if="view && !view.ready.image" class="muted">这件的图片指纹还在后台计算，稍后刷新会更准。</p>
    <p v-if="view?.imageModel && ['LOW_MEMORY', 'FAILED', 'INDEXING'].includes(view.imageModel.state)" class="muted">{{ view.imageModel.message }}</p>
  </section>
</template>
<style scoped>
.similar-panel { display: grid; gap: 14px; }
.similar-head h2 { margin: 0; }
.similar-head p { margin: 4px 0 0; font-size: 12px; }
.similar-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.similar-item { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-md); color: inherit; transition: border-color .15s, background .15s; }
.similar-item:hover { border-color: var(--muted-subtle); background: var(--surface-alt); }
.similar-thumb { width: 64px; height: 64px; border-radius: 8px; overflow: hidden; display: grid; place-items: center; background: var(--surface-alt); }
.similar-thumb img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
.similar-copy { display: grid; gap: 6px; min-width: 0; }
.similar-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.similar-title strong { overflow: hidden; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.similar-title :deep(.ant-tag) { flex: none; margin: 0; font-size: 11px; line-height: 18px; }
.similar-reasons { display: flex; flex-wrap: wrap; gap: 4px; }
.similar-reasons em { padding: 0 6px; border-radius: 4px; background: var(--surface-alt); color: var(--muted-strong); font-size: 11px; font-style: normal; line-height: 18px; }
.similar-item:hover .similar-reasons em { background: var(--surface); }
@media (max-width: 767px) { .similar-list { grid-template-columns: 1fr; } .similar-item { grid-template-columns: 56px minmax(0, 1fr); } .similar-thumb { width: 56px; height: 56px; } }
</style>
