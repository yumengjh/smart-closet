<script setup lang="ts">
import { computed } from 'vue'

/**
 * Schematic preview of an outfit template (issue #10): a figure with every slot drawn where it is worn, filled with its
 * first allowed colour (dashed grey when any colour fits, hatched when the slot needs a pattern). Pure drawing, no model
 * and no closet data, so a reviewer can see the structure and palette at a glance.
 */
type Slot = { roles: string[]; categoryAny: string[]; colorAny: string[]; patternMax: number | null; patternMin?: number | null; describe?: string[] }
const props = withDefaults(defineProps<{ slots: Slot[]; size?: number; uid: string }>(), { size: 96 })
const HEX: Record<string, string> = { BLACK: '#2b2b2b', WHITE: '#f7f7f2', GRAY: '#9b9b9b', BEIGE: '#d9c7a7', BROWN: '#8a5a3b', NAVY: '#24345c', DENIM: '#5b7fa8', BLUE: '#3d7bd9', RED: '#d23c3c', ORANGE: '#ec8a2f', YELLOW: '#f1cf3b', GREEN: '#4f9a55', PURPLE: '#8a5ab8', PINK: '#f0a1bd' }
// Paths on a 100×140 figure; the order is the drawing order (later on top).
const SHAPES: Record<string, string> = {
  BOTTOM_PANTS: 'M34 76h32l-2 52h-11l-3-38-3 38H36z',
  BOTTOM_SKIRT: 'M35 76h30l9 34H26z',
  ONE_PIECE: 'M38 34l6-4c2 4 4 6 6 6s4-2 6-6l6 4 4 20-6 2 9 52H25l9-52-6-2z',
  OVERALL: 'M38 52h24v4l9 52H29l9-52z M40 36h4v16h-4z M56 36h4v16h-4z',
  SOCKS: 'M38 112h8v16h-8z M54 112h8v16h-8z',
  TOP: 'M37 34l7-4c2 4 4 6 6 6s4-2 6-6l7 4 9 14-7 5-4-4v26H39V49l-4 4-7-5z',
  OUTER: 'M35 32l9-3 6 22 6-22 9 3 10 16-7 5-3-3v42H35V50l-3 3-7-5z',
  SHOES: 'M33 129h13v6H30c0-3 1-5 3-6z M54 129h13c2 1 3 3 3 6H54z',
  HAT: 'M38 15c2-9 22-9 24 0h6v4H32v-4z',
  HEADWEAR: 'M44 13l6 3 6-3v6l-6-3-6 3z',
  BAG: 'M76 66h14v14H76z M79 66c0-5 8-5 8 0',
  HANDHELD: 'M14 68a5 5 0 1 0 0.1 0z',
}
const ORDER = ['SOCKS', 'BOTTOM', 'ONE_PIECE', 'OVERALL', 'TOP', 'OUTER', 'SHOES', 'HAT', 'HEADWEAR', 'BAG', 'HANDHELD']
const parts = computed(() => {
  const out: { key: string; d: string; fill: string; any: boolean; pattern: boolean; title: string }[] = []
  props.slots.forEach((s, i) => {
    const role = ORDER.find(r => s.roles.includes(r)) || s.roles[0]
    if (!role) return
    const skirt = s.categoryAny.some(c => c.includes('裙'))
    const d = role === 'BOTTOM' ? (skirt ? SHAPES.BOTTOM_SKIRT : SHAPES.BOTTOM_PANTS) : SHAPES[role]
    if (!d) return
    const color = s.colorAny.find(c => HEX[c])
    out.push({ key: `${i}-${role}`, d, fill: color ? HEX[color] : '#d6d6d6', any: !color, pattern: Boolean(s.patternMin), title: (s.describe?.[0]) || s.categoryAny.join('/') || role })
  })
  return out.sort((a, b) => ORDER.indexOf(a.key.split('-')[1]) - ORDER.indexOf(b.key.split('-')[1]))
})
</script>
<template>
  <svg class="template-preview" :width="size" :height="Math.round(size * 1.4)" viewBox="0 0 100 140" role="img" :aria-label="`搭配示意：${parts.map(p => p.title).join('、')}`">
    <defs><pattern :id="`hatch-${uid}`" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="transparent" /><line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="2.4" opacity=".7" /></pattern></defs>
    <circle cx="50" cy="22" r="7" fill="#efe7dc" stroke="#c9bfb2" />
    <path d="M44 31h12v4H44z" fill="#efe7dc" />
    <g v-for="p in parts" :key="p.key">
      <title>{{ p.title }}</title>
      <path :d="p.d" :fill="p.fill" stroke="#5f5f5f" stroke-width="0.8" :stroke-dasharray="p.any ? '2 1.5' : undefined" stroke-linejoin="round" />
      <path v-if="p.pattern" :d="p.d" :fill="`url(#hatch-${uid})`" />
    </g>
  </svg>
</template>
<style scoped>
.template-preview { display: block; background: var(--surface-alt, #f6f6f3); border-radius: 8px; }
</style>
