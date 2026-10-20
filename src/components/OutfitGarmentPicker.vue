<script setup lang="ts">
import { thumbUrl } from '../services/urls'
import { CheckOutlined, PlusOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons-vue'
import { Empty } from 'ant-design-vue'
import type { Garment } from '../services/api'
import { artworkForGarment } from '../domain/outfit-images'
import { formatGarmentLabel, outfitRoleOptions, roleFromGarment, type OutfitRole } from '../domain/outfit'

defineProps<{
  garments: Garment[]; loading: boolean; search: string; role: OutfitRole | 'ALL';
  pickedIds: Set<string>; selectedId: string; replacing: boolean; mobile?: boolean; error?: string
}>()
const emit = defineEmits<{
  'update:search': [value: string]; 'update:role': [value: OutfitRole | 'ALL'];
  select: [garment: Garment]; context: [event: MouseEvent, garment: Garment];
  dragstart: [event: DragEvent, garment: Garment]; dragend: []; cancel: []; retry: []
}>()
const roles = [{ value: 'ALL', label: '全部分类' }, ...outfitRoleOptions]
</script>

<template>
  <div class="outfit-picker-content">
    <div class="outfit-picker-search">
      <a-input :value="search" allow-clear placeholder="搜索颜色、品类或品牌" aria-label="搜索衣物" @update:value="emit('update:search', $event)"><template #prefix><SearchOutlined /></template></a-input>
      <a-select :value="role" :options="roles" aria-label="筛选衣物分类" @update:value="emit('update:role', $event as OutfitRole | 'ALL')" />
    </div>
    <a-alert v-if="replacing" type="info" show-icon message="选择一件衣物替换，保留原来的布局。" class="outfit-picker-notice"><template #action><a-button size="small" type="link" @click="emit('cancel')">取消</a-button></template></a-alert>
    <a-skeleton v-if="loading" active :paragraph="{ rows: 6 }" />
    <div v-else-if="error" class="outfit-picker-empty"><a-empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂时无法读取衣柜" /><p>{{ error }}</p><a-button @click="emit('retry')">重新加载</a-button></div>
    <div v-else-if="garments.length" class="outfit-garment-list" :class="{ 'mobile-picker-grid': mobile }">
      <a-button v-for="garment in garments" :key="garment.id" type="text" class="outfit-garment-option" :class="{ selected: pickedIds.has(garment.id), 'is-active': selectedId === garment.id }"
        :draggable="!mobile && !replacing" :aria-label="`${pickedIds.has(garment.id) ? '定位' : replacing ? '替换为' : '加入'}${formatGarmentLabel(garment)}`" :aria-pressed="pickedIds.has(garment.id)"
        @click="emit('select', garment)" @contextmenu.prevent="emit('context', $event, garment)" @dragstart="emit('dragstart', $event, garment)" @dragend="emit('dragend')">
        <span class="outfit-garment-image"><img :src="thumbUrl(artworkForGarment(garment).url, 320)" alt="" draggable="false" loading="lazy" decoding="async" /><span v-if="pickedIds.has(garment.id)" class="outfit-picked-mark"><CheckOutlined /></span></span>
        <span class="outfit-garment-copy"><strong>{{ garment.category[0] || '衣物' }}</strong><span>{{ garment.primaryColor[0] || '颜色待确认' }}</span></span>
        <component :is="replacing ? SwapOutlined : pickedIds.has(garment.id) ? CheckOutlined : PlusOutlined" class="outfit-garment-add" />
      </a-button>
    </div>
    <div v-else class="outfit-picker-empty"><a-empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="没有符合条件的衣物" /><p>换个搜索词或分类，也可以先将衣物确认入柜。</p><RouterLink to="/wardrobe"><a-button>打开我的衣柜</a-button></RouterLink></div>
    <div class="outfit-picker-footer"><span>{{ pickedIds.size }} 件已加入</span><span>{{ mobile ? '点选加入，再到画板调整' : '点击加入 · 拖到画板指定位置' }}</span></div>
  </div>
</template>
