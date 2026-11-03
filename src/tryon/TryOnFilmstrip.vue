<script setup lang="ts">
import { computed, ref } from 'vue'
import { AppstoreOutlined, CheckOutlined } from '@ant-design/icons-vue'
import type { Outfit } from '../domain/outfit'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import { thumbUrl } from '../services/urls'
import type { Candidate, Selection } from './api'

const props = defineProps<{
  garments: Candidate[]; outfits: Outfit[]; selected: Selection[]; selectedOutfit: string | null
  blocked: boolean; busyId: string | null; title: string
}>()
const emit = defineEmits<{ toggle: [item: Selection]; outfit: [id: string]; more: []; all: [] }>()
const tab = ref('单品'), scroller = ref<HTMLElement>()
const ready = computed(() => props.garments.filter(g => g.ready))
const usable = computed(() => props.outfits.filter(o => o.scene.elements.some(e => e.garmentId)))
const has = (id: string) => props.selected.some(s => s.id === id)
function wheel(event: WheelEvent) {
  const el = scroller.value
  if (!el || Math.abs(event.deltaX) > Math.abs(event.deltaY) || el.scrollWidth <= el.clientWidth) return
  event.preventDefault(); el.scrollLeft += event.deltaY
}
function scrolled() {
  const el = scroller.value
  if (el && tab.value === '单品' && el.scrollLeft + el.clientWidth > el.scrollWidth - 160) emit('more')
}
</script>

<template>
  <section class="tryon-filmstrip" aria-label="快速换衣">
    <div class="strip-head">
      <strong :title="title">{{ title }}</strong>
      <a-segmented v-model:value="tab" size="small" :options="['单品', '搭配']" />
    </div>
    <div ref="scroller" class="strip-scroller" @wheel="wheel" @scroll.passive="scrolled">
      <template v-if="tab === '单品'">
        <a-button v-for="g in ready" :key="g.id" class="strip-item" :class="{ selected: has(g.id) }" :disabled="blocked || !!busyId" :aria-pressed="has(g.id)" :aria-label="g.name || '衣物'" :title="g.name || '衣物'" @click="emit('toggle', { type: 'GARMENT', id: g.id, revision: g.revision, assetId: g.assetId })">
          <img :src="thumbUrl(g.imageUrl, 160)" alt="" loading="lazy" decoding="async" />
          <CheckOutlined v-if="has(g.id)" class="strip-check" />
        </a-button>
        <p v-if="!ready.length" class="strip-empty">还没有可试穿的成品，打开全部衣物可以临时上传。</p>
      </template>
      <template v-else>
        <a-button v-for="o in usable" :key="o.id" class="strip-item is-outfit" :class="{ selected: selectedOutfit === o.id }" :disabled="blocked || !!busyId && busyId !== o.id" :loading="busyId === o.id" :aria-pressed="selectedOutfit === o.id" :aria-label="`选择搭配：${o.name}`" :title="o.name" @click="emit('outfit', o.id)">
          <OutfitThumbnail :scene="o.scene" :title="o.name" />
          <CheckOutlined v-if="selectedOutfit === o.id" class="strip-check" />
        </a-button>
        <p v-if="!usable.length" class="strip-empty">还没有已保存搭配。</p>
      </template>
    </div>
    <a-button class="strip-all" @click="emit('all')"><AppstoreOutlined /> 全部衣物</a-button>
  </section>
</template>

<style scoped>
.tryon-filmstrip { display: flex; flex: none; align-items: center; gap: 14px; height: 84px; padding: 8px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); }
.strip-head { display: flex; flex: none; flex-direction: column; gap: 6px; width: 132px; min-width: 0; }
.strip-head strong { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.strip-scroller { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; height: 100%; padding: 2px; overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; }
.strip-scroller::-webkit-scrollbar { display: none; }
.strip-item.ant-btn { position: relative; flex: none; width: 60px; height: 60px; padding: 3px; overflow: hidden; background: var(--surface-alt); border-color: transparent; border-radius: 10px; transition: transform .18s cubic-bezier(.22, 1, .36, 1), box-shadow .18s ease; }
.strip-item.ant-btn:not(:disabled):hover { background: var(--surface-alt); border-color: var(--line); transform: translateY(-2px); }
.strip-item.selected.ant-btn { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.strip-item img, .strip-item :deep(canvas) { display: block; width: 100%; height: 100%; object-fit: contain; }
.strip-item :deep(.outfit-thumbnail) { width: 100%; height: 100%; overflow: hidden; }
.strip-check { position: absolute; right: 3px; top: 3px; padding: 2px; font-size: 9px; color: #fff; background: var(--accent); border-radius: 50%; }
.strip-empty { margin: 0; font-size: 13px; color: var(--muted-strong); }
.strip-all.ant-btn { flex: none; min-height: 44px; }
@media (prefers-reduced-motion: reduce) { .strip-item.ant-btn { transition: none; } }
</style>
