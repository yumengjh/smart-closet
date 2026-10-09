<script setup lang="ts">
import { ref } from 'vue'
import { App } from 'ant-design-vue'
import { mediaUrl } from '../services/urls'
import { similarApi, LEVEL_LABELS, type ImageSearch } from './api'

/** 以图搜图 (design §5): local matting + colour/silhouette/look comparison, no model call. */
const open = defineModel<boolean>('open', { default: false })
const { message } = App.useApp()
const POSITIONS = [{ value: '', label: '不限' }, { value: 'TOP', label: '上装' }, { value: 'BOTTOM', label: '下装' }, { value: 'ONE_PIECE', label: '连衣裙' }, { value: 'OVERALL', label: '背带裙' },
  { value: 'OUTER', label: '外套' }, { value: 'SHOES', label: '鞋' }, { value: 'BAG', label: '包' }, { value: 'HAT', label: '帽子' }]
const role = ref(''); const preview = ref(''); const result = ref<ImageSearch | null>(null); const busy = ref(false)
function pick(file: File) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) { message.error('请选择 JPEG 或 PNG 图片。'); return false }
  if (file.size > 15 * 1024 * 1024) { message.error('图片不能超过 15 MB。'); return false }
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = URL.createObjectURL(file); search(file); return false
}
async function search(file: File) {
  busy.value = true; result.value = null
  try { result.value = await similarApi.searchByImage(file, role.value || undefined) }
  catch (e) { message.error(e instanceof Error ? e.message : '搜索失败。') }
  finally { busy.value = false }
}
</script>
<template>
  <a-modal v-model:open="open" title="以图搜图" :footer="null" width="min(760px, 100vw)">
    <div class="image-search">
      <div class="image-search-controls">
        <a-segmented v-model:value="role" :options="POSITIONS" aria-label="找哪个位置" />
        <a-upload :before-upload="pick" :show-upload-list="false" accept="image/jpeg,image/png"><a-button type="primary" :loading="busy">选择图片</a-button></a-upload>
      </div>
      <p class="muted">在你自己的衣柜里找颜色、轮廓、外观相近的衣物，本地计算，不调用模型、不占额度。</p>
      <div v-if="preview" class="image-search-body">
        <img :src="preview" alt="要搜索的图片" class="image-search-query" />
        <div>
          <a-spin v-if="busy" />
          <template v-else-if="result">
            <a-empty v-if="!result.items.length" description="衣柜里没有足够像的衣物" />
            <ul class="image-search-results">
              <li v-for="item in result.items" :key="item.id">
                <RouterLink :to="`/garment/${item.id}`" @click="open = false"><img v-if="item.displayUrl" :src="mediaUrl(item.displayUrl)" :alt="item.name" /></RouterLink>
                <div><RouterLink :to="`/garment/${item.id}`" @click="open = false"><strong>{{ item.name }}</strong></RouterLink>
                  <a-tag v-if="item.level" :color="LEVEL_LABELS[item.level].color">{{ LEVEL_LABELS[item.level].label }}</a-tag>
                  <span class="muted">{{ Math.round(item.score * 100) }} 分</span>
                  <p class="muted">{{ item.reasons.join('，') }}</p></div>
              </li>
            </ul>
            <a-alert type="info" show-icon :message="result.note" />
          </template>
        </div>
      </div>
    </div>
  </a-modal>
</template>
<style scoped>
.image-search { display: grid; gap: 12px; }
.image-search-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.image-search-body { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 16px; }
.image-search-query { width: 160px; max-height: 220px; object-fit: contain; border-radius: 8px; background: var(--surface-muted, rgba(0,0,0,.04)); }
.image-search-results { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 10px; }
.image-search-results li { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 10px; align-items: center; }
.image-search-results img { width: 56px; height: 56px; object-fit: contain; border-radius: 8px; background: var(--surface-muted, rgba(0,0,0,.04)); }
.image-search-results p { margin: 2px 0 0; font-size: 12px; }
@media (max-width: 600px) { .image-search-body { grid-template-columns: 1fr; } .image-search-query { width: 100%; } }
</style>
