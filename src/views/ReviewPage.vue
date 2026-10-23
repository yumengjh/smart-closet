<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { App as AntApp } from 'ant-design-vue'
import { CheckCircleOutlined } from '@ant-design/icons-vue'
import { closetApi, request, type Garment } from '../services/api'
import { thumbUrl } from '../services/urls'
import { forgetPictureCheck, loadPictureChecks } from '../wardrobe/pictureChecks'
import { useClosetStore } from '../stores/closet'

/**
 * 待核对：一处看完需要人工判断的衣物，就地处理，不必逐件打开详情。两类：本地图片比对与资料不一致的品类
 * （改成建议的品类，或确认资料没错），以及识图没能确定品类的衣物（直接选一个）。处理后都记为用户确认，不再出现。
 */
type Need = { garmentId: string; status: string; kind: 'CONFLICT' | 'MISSING_CATEGORY'; suggestion?: string; message: string }
type Row = Need & { garment: Garment | null }
const { message } = AntApp.useApp(); const closet = useClosetStore()
const rows = ref<Row[]>([]); const loading = ref(true); const error = ref(''); const busy = ref(''); const categories = ref<string[]>([]); const picked = ref<Record<string, string>>({})
async function load() {
  loading.value = true; error.value = ''
  try {
    const [r, options] = await Promise.all([request<{ items: Need[] }>('/api/garments/needs-review'), closetApi.metadataOptions().catch(() => ({} as Record<string, string[]>))])
    categories.value = options.category || []
    rows.value = await Promise.all(r.items.map(async n => ({ ...n, garment: await closetApi.detail(n.garmentId).catch(() => null) })))
    // A local picture guess preselects the category of a garment recognition left without one.
    for (const n of r.items) if (n.kind === 'MISSING_CATEGORY' && n.suggestion && !picked.value[n.garmentId]) picked.value[n.garmentId] = n.suggestion
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '待核对列表暂时无法加载。' }
  finally { loading.value = false }
}
onMounted(load)
async function settle(row: Row, category: string[], done: string) {
  if (!row.garment || !category.length || busy.value) return
  busy.value = row.garmentId
  try {
    await closetApi.update(row.garmentId, { fields: { category }, revision: row.garment.revision })
    forgetPictureCheck(row.garmentId); rows.value = rows.value.filter(r => r.garmentId !== row.garmentId); message.success(done)
    if (!rows.value.length) { void loadPictureChecks(true); void closet.refreshCounts() }
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '保存失败，请重试。') }
  finally { busy.value = '' }
}
const conflicts = computed(() => rows.value.filter(r => r.kind === 'CONFLICT'))
const missing = computed(() => rows.value.filter(r => r.kind === 'MISSING_CATEGORY'))
const title = (g: Garment | null) => g ? (g.name || `${g.primaryColor[0] && g.primaryColor[0] !== '未知颜色' ? g.primaryColor[0] : ''}${g.category[0] || '衣物'}`) : '衣物'
</script>

<template>
  <header class="page-heading"><div><h1>待核对</h1><p class="page-subtitle">识图拿不准的衣物都在这里，看图选一下就行。处理后记为你确认过的资料，不再提示。</p></div><span class="heading-count">{{ rows.length }} 件</span></header>
  <a-alert v-if="error" type="error" :message="error" show-icon class="page-alert"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
  <a-skeleton v-if="loading" active />
  <section v-else-if="!rows.length && !error" class="empty-wardrobe compact-empty"><span class="empty-spark"><CheckCircleOutlined /></span><h2>没有需要核对的衣物</h2><p>识图拿不准的衣物会出现在这里。</p><RouterLink to="/wardrobe" class="outline-button">回到衣柜</RouterLink></section>
  <template v-else>
    <template v-for="group in [{ key: 'c', title: '品类可能不对', items: conflicts }, { key: 'm', title: '没有品类', items: missing }]" :key="group.key">
      <h2 v-if="group.items.length" class="review-group">{{ group.title }}<small>{{ group.items.length }} 件</small></h2>
      <div class="review-list">
        <article v-for="row in group.items" :key="row.garmentId" class="review-row">
          <RouterLink :to="`/garment/${row.garmentId}`" class="review-image" :aria-label="`打开${title(row.garment)}`"><img v-if="row.garment?.displayUrl" :src="thumbUrl(row.garment.displayUrl, 320)" :alt="title(row.garment)" loading="lazy" /></RouterLink>
          <div class="review-copy">
            <strong>{{ title(row.garment) }}<a-tag v-if="row.status === 'DRAFT'" class="review-draft">未入柜</a-tag></strong>
            <small>现在：{{ row.garment?.category.join('/') || '没有品类' }}<template v-if="row.garment?.subtype?.length">（{{ row.garment.subtype.join('、') }}）</template></small>
            <p>{{ row.message }}</p>
            <a-space wrap>
              <template v-if="row.kind === 'CONFLICT' && row.suggestion">
                <a-button type="primary" size="small" :loading="busy === row.garmentId" @click="settle(row, [row.suggestion], '品类已改正。')">改成{{ row.suggestion }}</a-button>
                <a-button size="small" :disabled="busy === row.garmentId" @click="settle(row, row.garment?.category || [], '已确认，不再提示。')">资料没错</a-button>
              </template>
              <template v-else>
                <a-select v-model:value="picked[row.garmentId]" size="small" class="review-select" show-search placeholder="选择品类" :options="[...new Set([...(row.suggestion ? [row.suggestion] : []), ...categories])].map(c => ({ value: c, label: c }))" />
                <a-button type="primary" size="small" :disabled="!picked[row.garmentId]" :loading="busy === row.garmentId" @click="settle(row, [picked[row.garmentId]], '品类已保存。')">保存</a-button>
              </template>
            </a-space>
          </div>
        </article>
      </div>
    </template>
  </template>
</template>

<style scoped>
.review-group { display: flex; align-items: baseline; gap: 8px; margin: 24px 0 12px; font-size: 16px; }
.review-group small { color: var(--muted-copy); font-weight: 400; font-size: 13px; }
.review-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
.review-row { display: flex; gap: 14px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
.review-image { flex: none; width: 112px; height: 112px; border-radius: var(--radius-md); background: var(--surface-alt); overflow: hidden; }
.review-image img { width: 100%; height: 100%; object-fit: contain; }
.review-copy { display: grid; align-content: start; gap: 4px; min-width: 0; }
.review-copy strong { font-size: 14px; }
.review-copy small { color: var(--muted-copy); font-size: 12px; }
.review-copy p { margin: 2px 0 6px; font-size: 13px; line-height: 1.6; }
.review-draft { margin-left: 6px; }
.review-select { min-width: 140px; }
@media (max-width: 767px) { .review-list { grid-template-columns: 1fr; } .review-image { width: 96px; height: 96px; } }
</style>
