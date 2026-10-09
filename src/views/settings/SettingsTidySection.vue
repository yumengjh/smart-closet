<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { mediaUrl } from '../../services/urls'
import { similarApi, type DuplicatePair } from '../../similar/api'

/** 整理衣柜 · 可能重复 (design 相似衣物 §4): pairs that look like the same piece entered twice. Hints only. */
const { message } = App.useApp()
const pairs = ref<DuplicatePair[]>([]); const loading = ref(true); const error = ref(''); const busy = ref('')
async function load() {
  loading.value = true; error.value = ''
  try { pairs.value = (await similarApi.duplicates()).items }
  catch (e) { error.value = e instanceof Error ? e.message : '暂时无法加载。' }
  finally { loading.value = false }
}
async function dismiss(p: DuplicatePair) {
  busy.value = p.a.id + p.b.id
  try { await similarApi.dismiss(p.a.id, p.b.id); pairs.value = pairs.value.filter(x => x !== p); message.success('已记住：这两件不是重复。') }
  catch (e) { message.error(e instanceof Error ? e.message : '操作失败。') }
  finally { busy.value = '' }
}
onMounted(load)
</script>
<template>
  <div class="settings-section-content tidy-section">
    <p class="muted">按颜色、轮廓、外观和描述比对出的“可能重复录入”的衣物。只是提示，不会自动合并或删除；确认是重复的，可以打开其中一件移入回收站。新入柜的衣物需要几十秒完成图片指纹后才会出现在这里。</p>
    <a-alert v-if="error" type="error" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-spin v-if="loading" />
    <a-empty v-else-if="!pairs.length && !error" description="没有发现可能重复的衣物" />
    <ul v-else class="tidy-pairs">
      <li v-for="p in pairs" :key="p.a.id + p.b.id">
        <div class="tidy-pair">
          <RouterLink v-for="g in [p.a, p.b]" :key="g.id" :to="`/garment/${g.id}`" class="tidy-item"><img v-if="g.displayUrl" :src="mediaUrl(g.displayUrl)" :alt="g.name" /><span>{{ g.name }}</span></RouterLink>
        </div>
        <p class="muted">{{ p.reasons.join('，') }}</p>
        <a-button size="small" :loading="busy === p.a.id + p.b.id" @click="dismiss(p)">不是重复</a-button>
      </li>
    </ul>
  </div>
</template>
<style scoped>
.tidy-section { display: grid; gap: 12px; }
.tidy-pairs { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.tidy-pairs li { display: grid; gap: 6px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,.06)); }
.tidy-pair { display: flex; gap: 12px; flex-wrap: wrap; }
.tidy-item { display: grid; justify-items: center; gap: 4px; width: 120px; text-align: center; }
.tidy-item img { width: 96px; height: 96px; object-fit: contain; border-radius: 8px; background: var(--surface-muted, rgba(0,0,0,.04)); }
.tidy-pairs p { margin: 0; font-size: 12px; }
.tidy-pairs li > button { justify-self: start; }
</style>
