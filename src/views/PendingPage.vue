<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CheckCircleOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { closetApi, type Garment } from '../services/api'
import { isProcessing } from '../domain/workflow'
import { useClosetStore } from '../stores/closet'
import GarmentCard from '../components/GarmentCard.vue'
import GarmentCardSkeleton from '../components/GarmentCardSkeleton.vue'
const closet = useClosetStore(); const items = ref<Garment[]>([]); const loading = ref(true); const error = ref(''); const filter = ref('全部')
const page = ref(1); const total = ref(0); let timer = 0; let alive = false; let delay = 2000
const needsAction = (item: Garment) => !isProcessing(item.taskStatus) && (Boolean(item.imageProcessing?.stickerRequired && !item.imageProcessing.stickerReady) || ['FAILED', 'UNKNOWN', 'CANCELLED', 'NEEDS_REVIEW'].includes(item.taskStatus || ''))
const filtered = computed(() => items.value.filter(item => filter.value === '全部' || (filter.value === '处理中' ? isProcessing(item.taskStatus) : filter.value === '需处理' ? needsAction(item) : !isProcessing(item.taskStatus) && !needsAction(item))))
async function load() {
  try { const response = await closetApi.list({ status: 'DRAFT', q: '', category: '', color: '', season: '', page: page.value, size: 24 }); if (!alive) return; items.value = response.items; total.value = response.total; error.value = ''; delay = 2000 }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '未入柜衣物暂时无法加载。'; delay = Math.min(30000, delay * 2) }
  finally { loading.value = false }
}
function poll() { window.clearTimeout(timer); if (alive && (error.value || items.value.some(item => isProcessing(item.taskStatus)))) timer = window.setTimeout(async () => { await load(); poll() }, delay) }
async function turnPage(change: number) { page.value += change; loading.value = true; await load(); poll() }
onMounted(async () => { alive = true; await load(); await closet.refreshCounts(); poll() }); onUnmounted(() => { alive = false; window.clearTimeout(timer) })
</script>
<template>
  <header class="page-heading"><div><h1>未入柜</h1><p class="page-subtitle">处理中的照片和待核对结果都在这里。确认入柜后，它们会移到“我的衣柜”。</p></div><span class="heading-count">{{ total }} 件</span></header>
  <div class="list-toolbar"><a-segmented v-model:value="filter" :options="['全部', '处理中', '待核对', '需处理']" /><span class="muted">状态筛选当前页</span></div>
  <a-alert v-if="error" type="error" :message="error" show-icon class="page-alert" />
  <GarmentCardSkeleton v-if="loading" label="正在加载未入柜衣物…" />
  <section v-else-if="filtered.length" class="garment-grid"><GarmentCard v-for="item in filtered" :key="item.id" :garment="item" pending /></section>
  <section v-else class="empty-wardrobe compact-empty"><span class="empty-spark"><CheckCircleOutlined /></span><h2>{{ total ? '当前页没有此状态的衣物' : '没有未入柜的衣物' }}</h2><p>上传后可查看处理进度，处理结束后在工作台核对结果。</p><RouterLink to="/add" class="outline-button"><PlusOutlined /> 添加衣物</RouterLink></section>
  <footer v-if="total > 24" class="pagination-row"><span>第 {{ page }} / {{ Math.ceil(total / 24) }} 页</span><div><a-button :disabled="page === 1" @click="turnPage(-1)">上一页</a-button><a-button :disabled="page * 24 >= total" @click="turnPage(1)">下一页</a-button></div></footer>
</template>
