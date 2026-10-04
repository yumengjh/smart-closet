<script setup lang="ts">
import { mediaUrl } from '../services/urls'
import { ref, watch } from 'vue'
import { PictureOutlined } from '@ant-design/icons-vue'
import { usingMocks, type Garment } from '../services/api'

const props = defineProps<{ garment: Garment; compact?: boolean }>()
const failed = ref(false)
watch(() => props.garment.displayUrl, () => { failed.value = false })
</script>

<template>
  <div class="garment-art" :class="{ 'has-photo': garment.displayUrl, compact }" :style="{ '--cloth': garment.imageColor }" role="img" :aria-label="`${garment.primaryColor[0] || '未知颜色'}${garment.category[0] || '衣物'}`">
    <img v-if="garment.displayUrl && !failed" :src="mediaUrl(garment.displayUrl)" alt="" @error="failed = true" />
    <div v-else-if="!usingMocks" class="photo-unavailable"><PictureOutlined /><span>{{ failed ? '图片暂时无法加载' : '暂无展示图片' }}</span></div>
    <svg v-else viewBox="0 0 240 245" aria-hidden="true">
      <defs>
        <linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="white" stop-opacity=".28"/><stop offset="1" stop-color="#173b30" stop-opacity=".16"/></linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="7"/></filter>
      </defs>
      <ellipse cx="121" cy="215" rx="59" ry="10" fill="#34453c" opacity=".15" filter="url(#shadow)"/>
      <path d="M81 46 102 34c5 12 12 18 19 18s14-6 19-18l21 12 28 19-18 34-15-9 7 102c-27 11-64 11-91 0l7-102-15 9-18-34z" :fill="garment.imageColor" stroke="#35473e" stroke-opacity=".17" stroke-width="2" stroke-linejoin="round"/>
      <path d="M81 46 102 34c5 12 12 18 19 18s14-6 19-18l21 12 28 19-18 34-15-9 7 102c-27 11-64 11-91 0l7-102-15 9-18-34z" fill="url(#fabric)"/>
      <path d="M102 35c2 18 9 27 19 27s17-9 19-27" fill="none" stroke="#23362d" stroke-opacity=".21" stroke-width="2"/>
      <path d="M117 61v120" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
      <path d="M105 126h15m9 0h15m-39 7h15m9 0h15" v-if="garment.patterns.some((value) => value.includes('条纹'))" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
      <path d="m108 100 7 7 7-7-7-8z m17 20 7 7 7-7-7-8z m-19 38 7 7 7-7-7-8z" v-else-if="garment.patterns.some((value) => value.includes('花'))" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>
      <rect x="145" y="141" width="21" height="18" rx="2" fill="none" stroke="#fff" stroke-opacity=".28" v-if="garment.closure[0] === '纽扣'"/>
    </svg>
  </div>
</template>
