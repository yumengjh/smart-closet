<script setup lang="ts">
import { computed } from 'vue'
import { thumbUrl } from '../services/urls'

const props = withDefaults(defineProps<{ pieces: { id: string; role: string; displayUrl?: string | null }[]; size?: number; compact?: boolean; title?: string }>(), { size: 480, compact: false, title: '' })
const labels: Record<string, string> = { TOP: '上装', INNER: '内搭', OUTER: '外套', BOTTOM: '下装', ONE_PIECE: '连体', OVERALL: '背带', SHOES: '鞋子' }
const visible = computed(() => props.pieces.slice(0, props.compact ? 4 : 6))
const remaining = computed(() => props.pieces.length - visible.value.length)
</script>
<template>
  <span class="piece-cards" :class="{ compact }" role="img" :aria-label="`${title || '搭配'}，共 ${pieces.length} 件单品${remaining ? `，另有 ${remaining} 件未展示` : ''}`">
    <span class="piece-grid" :class="[{ single: visible.length === 1, pair: visible.length === 2 }, `count-${visible.length}`]">
      <span v-for="(piece, i) in visible" :key="`${piece.id}-${i}`" class="piece-card">
        <span v-if="!compact" class="piece-label">{{ labels[piece.role] || '配件' }}</span>
        <img v-if="piece.displayUrl" :src="thumbUrl(piece.displayUrl, size)" alt="" draggable="false" loading="lazy" decoding="async" />
        <span v-else class="piece-missing">暂无图片</span>
      </span>
    </span>
    <span v-if="remaining" class="piece-more">+{{ remaining }}</span>
  </span>
</template>
<style scoped>
.piece-cards { position: relative; display: grid; grid-template-rows: minmax(0, 1fr); place-items: center; box-sizing: border-box; min-width: 0; min-height: 0; width: 100%; height: 100%; padding: 12px; }
.piece-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 7px; width: min(100%, 400px); height: min(100%, 300px); }
.piece-grid.single { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); width: min(55%, 190px); }
.piece-grid.pair { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: minmax(0, 1fr); height: min(70%, 200px); }
.piece-cards:not(.compact) .piece-grid { width: min(92%, 400px); height: min(88%, 300px); gap: 12px; }
.piece-cards:not(.compact) .piece-grid.count-3, .piece-cards:not(.compact) .piece-grid.count-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.piece-cards:not(.compact) .piece-grid.count-1 { width: min(50%, 170px); }
.piece-cards:not(.compact) .piece-grid.count-2 { height: min(65%, 190px); }
.piece-cards:not(.compact) .piece-card:nth-child(6n+1) { transform: translate(-3%, 3%) rotate(-6deg); }
.piece-cards:not(.compact) .piece-card:nth-child(6n+2) { transform: translate(3%, -3%) rotate(5deg); }
.piece-cards:not(.compact) .piece-card:nth-child(6n+3) { transform: translate(-2%, 2%) rotate(4deg); }
.piece-cards:not(.compact) .piece-card:nth-child(6n+4) { transform: translate(3%, 1%) rotate(-5deg); }
.piece-cards:not(.compact) .piece-card:nth-child(6n+5) { transform: translate(-2%, -2%) rotate(-3deg); }
.piece-cards:not(.compact) .piece-card:nth-child(6n+6) { transform: translate(2%, 2%) rotate(6deg); }
.piece-card { position: relative; display: grid; place-items: center; min-width: 0; min-height: 0; padding: 22px 5px 5px; overflow: hidden; border-radius: 11px; background: var(--surface); box-shadow: 0 1px 5px #0000001a; }
.piece-card img { width: 100%; height: 100%; min-height: 0; object-fit: contain; pointer-events: none; }
.piece-label { position: absolute; top: 5px; left: 6px; padding: 1px 6px; border-radius: 8px; color: var(--ink); background: var(--surface-alt); font-size: 11px; line-height: 16px; }
.piece-missing { color: var(--muted-strong); font-size: 11px; }
.piece-more { position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; border-radius: 8px; color: var(--ink); background: var(--surface); font-size: 12px; }
.compact { padding: 7px; }
.compact .piece-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; width: 100%; height: 100%; }
.compact .piece-grid.single { grid-template-columns: 1fr; width: 70%; }
.compact .piece-grid.pair { height: 70%; }
.compact .piece-card { padding: 3px; border-radius: 6px; }
.compact .piece-missing { font-size: 9px; }
</style>
