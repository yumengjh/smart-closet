<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { ScanOutlined } from '@ant-design/icons-vue'
import { thumbUrl } from '../../services/urls'
import type { ImageModelStatus } from '../../services/api'
import { similarApi, type DuplicatePair, type DuplicateScan } from '../../similar/api'
import { useNotificationStore } from '../../stores/notifications'

/**
 * 整理衣柜 · 可能重复 (design 相似衣物 §4, 模型内存与图像向量 §8.3): pairs that look like the same piece entered twice.
 * Hints only. New garments are checked automatically when they enter the closet; the scan button re-checks everything.
 */
const { message } = App.useApp(), notices = useNotificationStore()
const pairs = ref<DuplicatePair[]>([]); const loading = ref(true); const error = ref(''); const busy = ref('')
const scan = ref<DuplicateScan | null>(null); const imageModel = ref<ImageModelStatus | null>(null); const starting = ref(false)
const scanning = computed(() => scan.value?.status === 'QUEUED' || scan.value?.status === 'RUNNING')
let poll: ReturnType<typeof setTimeout> | undefined
async function load() {
  loading.value = true; error.value = ''
  try { const r = await similarApi.duplicates(); pairs.value = r.items; imageModel.value = r.imageModel ?? null }
  catch (e) { error.value = e instanceof Error ? e.message : '暂时无法加载。' }
  finally { loading.value = false }
}
async function watchScan() {
  clearTimeout(poll)
  try {
    const r = await similarApi.scanStatus(); const was = scanning.value
    scan.value = r.scan; imageModel.value = r.imageModel ?? imageModel.value
    if (scanning.value) poll = setTimeout(watchScan, 2000)
    else if (was) { await load(); void notices.refresh(); if (scan.value?.status === 'DONE') message.success(scan.value.pairs ? `扫描完成：发现 ${scan.value.pairs} 对可能重复的衣物。` : '扫描完成：没有发现可能重复的衣物。'); else message.error('扫描没有完成，请稍后再试。') }
  } catch { poll = setTimeout(watchScan, 5000) }
}
async function startScan() {
  starting.value = true
  try { scan.value = (await similarApi.startScan()).scan; poll = setTimeout(watchScan, 1500) }
  catch (e) { message.error(e instanceof Error ? e.message : '暂时无法开始扫描。') }
  finally { starting.value = false }
}
const scanSummary = computed(() => {
  const s = scan.value
  if (!s) return ''
  if (scanning.value) return '正在扫描：先补齐图片指纹和图像识别，再逐对比对…'
  const when = new Date(s.finishedAt || s.requestedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return s.status === 'DONE' ? `上次扫描 ${when}：${s.pairs ? `${s.pairs} 对可能重复` : '没有发现重复'}` : `上次扫描 ${when} 没有完成`
})
async function dismiss(p: DuplicatePair) {
  busy.value = p.a.id + p.b.id
  try { await similarApi.dismiss(p.a.id, p.b.id); pairs.value = pairs.value.filter(x => x !== p); message.success('已记住：这两件不是重复。') }
  catch (e) { message.error(e instanceof Error ? e.message : '操作失败。') }
  finally { busy.value = '' }
}
onMounted(() => { void load(); void watchScan() })
onUnmounted(() => clearTimeout(poll))
</script>
<template>
  <div class="settings-section-content tidy-section">
    <p class="muted">按图像、颜色、轮廓、外观和描述比对出的“可能重复录入”的衣物。只是提示，不会自动合并或删除；确认是重复的，可以打开其中一件移入回收站。新衣物入柜后会自动检查一次，发现可能重复会在右上角提醒你。</p>
    <div class="tidy-scan">
      <a-button type="primary" :loading="starting || scanning" @click="startScan"><ScanOutlined v-if="!starting && !scanning" /> {{ scanning ? '扫描中' : '一键扫描整个衣柜' }}</a-button>
      <span class="muted">{{ scanSummary || '扫描在后台进行，完成后会在右上角提醒。' }}</span>
    </div>
    <a-alert v-if="imageModel && imageModel.state !== 'READY'" :type="imageModel.state === 'INDEXING' || imageModel.state === 'NOT_INSTALLED' ? 'info' : 'warning'" show-icon :message="imageModel.message" />
    <a-alert v-if="error" type="error" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-spin v-if="loading" />
    <a-empty v-else-if="!pairs.length && !error" description="没有发现可能重复的衣物" />
    <ul v-else class="tidy-pairs">
      <li v-for="p in pairs" :key="p.a.id + p.b.id">
        <div class="tidy-pair">
          <RouterLink v-for="g in [p.a, p.b]" :key="g.id" :to="`/garment/${g.id}`" class="tidy-item"><img v-if="g.displayUrl" :src="thumbUrl(g.displayUrl, 320)" :alt="g.name" loading="lazy" decoding="async" /><span>{{ g.name }}</span></RouterLink>
        </div>
        <p class="muted">{{ p.reasons.join('，') }}</p>
        <a-button size="small" :loading="busy === p.a.id + p.b.id" @click="dismiss(p)">不是重复</a-button>
      </li>
    </ul>
  </div>
</template>
<style scoped>
.tidy-section { display: grid; gap: 12px; }
.tidy-scan { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.tidy-scan .muted { font-size: 13px; }
.tidy-pairs { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.tidy-pairs li { display: grid; gap: 6px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle, rgba(0,0,0,.06)); }
.tidy-pair { display: flex; gap: 12px; flex-wrap: wrap; }
.tidy-item { display: grid; justify-items: center; gap: 4px; width: 120px; text-align: center; }
.tidy-item img { width: 96px; height: 96px; object-fit: contain; border-radius: 8px; background: var(--surface-muted, rgba(0,0,0,.04)); }
.tidy-pairs p { margin: 0; font-size: 12px; }
.tidy-pairs li > button { justify-self: start; }
</style>
