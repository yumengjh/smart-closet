<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowLeftOutlined, RollbackOutlined } from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import { closetApi, type Garment } from '../services/api'
import { useClosetStore } from '../stores/closet'
import GarmentArt from '../components/GarmentArt.vue'

const router = useRouter()
const closet = useClosetStore()
const items = ref<Garment[]>([])
const busy = ref('')
const error = ref('')
async function load() {
  try { items.value = (await closetApi.list({ status: 'TRASHED', q: '', category: '', color: '', season: '', page: 1, size: 50 })).items }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '回收站暂时无法加载。' }
}
async function restore(item: Garment) {
  busy.value = item.id; error.value = ''
  try { await closetApi.restore(item.id, 'ACTIVE', item.revision); items.value = items.value.filter((candidate) => candidate.id !== item.id); await closet.refreshCounts() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '恢复失败。' }
  finally { busy.value = '' }
}
onMounted(load)
</script>

<template>
  <button class="back-link" @click="router.push('/settings')"><ArrowLeftOutlined /> 返回“我的”</button>
  <div class="page-heading simple-heading trash-heading"><div><h1>回收站</h1><p class="page-subtitle">删除的衣物保留图片与历史，恢复后回到删除前的状态。</p></div><span class="heading-count">{{ items.length }} 件<br />衣物暂存</span></div>
  <a-alert v-if="error" type="error" :message="error" show-icon class="page-alert" />
  <section v-if="items.length" class="garment-grid trash-grid"><article v-for="item in items" :key="item.id" class="garment-card trash-card"><div class="card-image-wrap"><GarmentArt :garment="item" /><span class="card-status">回收站</span></div><div class="card-copy"><div><h3>{{ item.category[0] === '未分类' ? '未分类衣物' : `${item.primaryColor[0] || ''}${item.category[0]}` }}</h3><p>{{ item.patterns[0] || '暂无补充信息' }}</p></div><a-button class="restore-button" :loading="busy === item.id" @click="restore(item)"><RollbackOutlined /> 恢复</a-button></div></article></section>
  <section v-else class="empty-wardrobe compact-empty"><span class="empty-spark"><RollbackOutlined /></span><h2>回收站是空的。</h2><p>暂时没有被移出的衣物。</p></section>
</template>
