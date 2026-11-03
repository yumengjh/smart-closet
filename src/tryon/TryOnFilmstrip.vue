<script setup lang="ts">
import { computed, ref } from 'vue'
import { AppstoreOutlined, CheckOutlined, LeftOutlined, SkinOutlined } from '@ant-design/icons-vue'
import type { Outfit } from '../domain/outfit'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import { thumbUrl } from '../services/urls'
import type { Candidate, Selection } from './api'

/** 桌面快速换衣：浮在舞台左侧的竖向衣物栏，可收起成一枚按钮，不再占用舞台下方的高度。 */
const props = defineProps<{
  garments: Candidate[]; outfits: Outfit[]; selected: Selection[]; selectedOutfit: string | null
  blocked: boolean; busyId: string | null; title: string; open: boolean
}>()
const emit = defineEmits<{ toggle: [item: Selection]; outfit: [id: string]; more: []; all: []; 'update:open': [value: boolean] }>()
const tab = ref('单品'), scroller = ref<HTMLElement>()
const ready = computed(() => props.garments.filter(g => g.ready))
const usable = computed(() => props.outfits.filter(o => o.scene.elements.some(e => e.garmentId)))
const has = (id: string) => props.selected.some(s => s.id === id)
function scrolled() {
  const el = scroller.value
  if (el && tab.value === '单品' && el.scrollTop + el.clientHeight > el.scrollHeight - 160) emit('more')
}
</script>

<template>
  <Transition name="rail" mode="out-in">
    <section v-if="open" key="open" class="tryon-rail" aria-label="快速换衣">
      <header class="rail-head">
        <strong :title="title">{{ title }}</strong>
        <a-tooltip title="收起衣物栏" placement="right"><a-button type="text" size="small" class="rail-fold" aria-label="收起衣物栏" @click="emit('update:open', false)"><LeftOutlined /></a-button></a-tooltip>
      </header>
      <a-segmented v-model:value="tab" size="small" block :options="['单品', '搭配']" />
      <div ref="scroller" class="rail-scroller" @scroll.passive="scrolled">
        <template v-if="tab === '单品'">
          <a-button v-for="g in ready" :key="g.id" class="rail-item" :class="{ selected: has(g.id) }" :disabled="blocked || !!busyId" :aria-pressed="has(g.id)" :aria-label="g.name || '衣物'" :title="g.name || '衣物'" @click="emit('toggle', { type: 'GARMENT', id: g.id, revision: g.revision, assetId: g.assetId })">
            <img :src="thumbUrl(g.imageUrl, 160)" alt="" loading="lazy" decoding="async" />
            <CheckOutlined v-if="has(g.id)" class="rail-check" />
          </a-button>
          <p v-if="!ready.length" class="rail-empty">还没有可试穿的成品，可在全部衣物里临时上传。</p>
        </template>
        <template v-else>
          <a-button v-for="o in usable" :key="o.id" class="rail-item" :class="{ selected: selectedOutfit === o.id }" :disabled="blocked || !!busyId && busyId !== o.id" :loading="busyId === o.id" :aria-pressed="selectedOutfit === o.id" :aria-label="`选择搭配：${o.name}`" :title="o.name" @click="emit('outfit', o.id)">
            <OutfitThumbnail :scene="o.scene" :title="o.name" />
            <CheckOutlined v-if="selectedOutfit === o.id" class="rail-check" />
          </a-button>
          <p v-if="!usable.length" class="rail-empty">还没有已保存搭配。</p>
        </template>
      </div>
      <a-button block class="rail-all" @click="emit('all')"><AppstoreOutlined /> 全部衣物</a-button>
    </section>
    <a-tooltip v-else key="closed" title="展开衣物栏" placement="right">
      <a-button class="tryon-rail-tab" :aria-label="`展开衣物栏，已选 ${selected.length} 件`" @click="emit('update:open', true)">
        <SkinOutlined /><span v-if="selected.length" class="rail-count">{{ selected.length }}</span>
      </a-button>
    </a-tooltip>
  </Transition>
</template>

<style scoped>
/* 用站点表面色而不是相机黑：浅色主题是一张白色浮卡，深色主题自动跟随。 */
.tryon-rail { display: flex; flex-direction: column; gap: 10px; width: 172px; max-height: 100%; padding: 12px; color: var(--ink); background: var(--overlay); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: 0 8px 28px #0000001f; backdrop-filter: blur(14px); }
.rail-head { display: flex; align-items: center; gap: 4px; min-width: 0; }
.rail-head strong { flex: 1; min-width: 0; overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.rail-fold.ant-btn { flex: none; width: 28px; height: 28px; padding: 0; color: var(--muted-strong); }
.rail-scroller { display: grid; grid-template-columns: repeat(2, 68px); grid-auto-rows: 68px; align-content: start; gap: 8px; min-height: 0; margin: 0 -4px; padding: 2px 4px; overflow-y: auto; scrollbar-width: thin; overscroll-behavior: contain; }
.rail-item.ant-btn { position: relative; width: 68px; height: 68px; padding: 4px; overflow: hidden; background: var(--surface-alt); border-color: transparent; border-radius: var(--radius-md); transition: border-color .15s ease, box-shadow .15s ease; }
.rail-item.ant-btn:not(:disabled):hover { background: var(--surface-alt); border-color: var(--line); }
.rail-item.selected.ant-btn { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.rail-item img, .rail-item :deep(canvas) { display: block; width: 100%; height: 100%; object-fit: contain; }
.rail-item :deep(.outfit-thumbnail) { width: 100%; height: 100%; overflow: hidden; }
.rail-check { position: absolute; right: 4px; top: 4px; padding: 2px; font-size: 9px; color: #fff; background: var(--accent); border-radius: 50%; }
.rail-empty { grid-column: 1 / -1; margin: 4px 0; font-size: 12px; line-height: 1.7; color: var(--muted-strong); }
.rail-all.ant-btn { flex: none; min-height: 36px; }
.tryon-rail-tab.ant-btn { position: relative; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; font-size: 18px; color: var(--ink); background: var(--overlay); border-color: var(--line); border-radius: var(--radius-md); box-shadow: 0 6px 20px #0000001f; backdrop-filter: blur(14px); }
.rail-count { position: absolute; right: -6px; top: -6px; min-width: 18px; height: 18px; padding: 0 5px; font-size: 11px; line-height: 18px; color: #fff; background: var(--accent); border-radius: 9px; }
.rail-enter-active, .rail-leave-active { transition: opacity .18s ease, transform .18s cubic-bezier(.22, 1, .36, 1); }
.rail-enter-from, .rail-leave-to { opacity: 0; transform: translateX(-10px); }
@media (prefers-reduced-motion: reduce) { .rail-enter-active, .rail-leave-active { transition: none; } }
</style>
