<script setup lang="ts">
import { computed } from 'vue'
import { FolderOutlined } from '@ant-design/icons-vue'
import OutfitThumbnail from '../OutfitThumbnail.vue'
import type { Collection } from '../../services/inspirations'
import type { Outfit } from '../../domain/outfit'
import { mediaUrl } from '../../services/urls'

/**
 * 合集封面（体验改版，2026-11-23）：最近放进去的三张图叠成一摞，像一叠照片；只有搭配时画最近那套搭配；空合集是一个淡淡的文件夹。
 */
const props = withDefaults(defineProps<{ collection: Collection; outfits?: Map<string, Outfit>; size?: 'sm' | 'md' }>(), { size: 'md', outfits: () => new Map() })
const thumbs = computed(() => (props.collection.coverThumbUrls?.length ? props.collection.coverThumbUrls : props.collection.coverThumbUrl ? [props.collection.coverThumbUrl] : []).slice(0, 3))
const outfit = computed(() => !thumbs.value.length && props.collection.coverOutfitId ? props.outfits.get(props.collection.coverOutfitId) || null : null)
</script>

<template>
  <span class="cc" :class="[size, { single: thumbs.length === 1 }]" aria-hidden="true">
    <template v-if="thumbs.length">
      <img v-for="(url, n) in [...thumbs].reverse()" :key="url" :src="mediaUrl(url)" alt="" loading="lazy" :style="{ '--n': thumbs.length - 1 - n }" />
    </template>
    <span v-else-if="outfit" class="cc-outfit"><OutfitThumbnail :scene="outfit.scene" :title="outfit.name" :resolution="160" /></span>
    <span v-else class="cc-empty"><FolderOutlined /></span>
  </span>
</template>

<style scoped>
.cc { position: relative; display: block; width: 100%; aspect-ratio: 1; }
.cc img { position: absolute; inset: 8% 12% 4%; width: 76%; height: 88%; border-radius: 12px; object-fit: cover; background: var(--surface-alt); box-shadow: 0 6px 14px -8px #00000059, 0 0 0 1px #0000000d;
  transform: translateX(calc((var(--n) - 1) * 10%)) rotate(calc((var(--n) - 1) * 6deg)); transform-origin: 50% 100%; transition: transform .3s cubic-bezier(.2, .9, .2, 1); }
.cc.single img { transform: none; inset: 4%; width: 92%; height: 92%; }
.cc img:nth-last-child(1) { z-index: 3; }
.cc img:nth-last-child(2) { z-index: 2; }
.cc-outfit, .cc-empty { position: absolute; inset: 4%; display: grid; place-items: center; overflow: hidden; border-radius: 12px; background: var(--surface-alt); box-shadow: 0 0 0 1px var(--line); }
.cc-empty { color: var(--muted-subtle); font-size: 26px; }
.cc.sm .cc-empty { font-size: 18px; }
.cc.sm img { border-radius: 8px; }
@media (prefers-reduced-motion: reduce) { .cc img { transition: none; } }
</style>
