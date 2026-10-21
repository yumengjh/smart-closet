<script setup lang="ts">
/** Bottom-bar icons: one line style (1.7 stroke, round joins); the active tab gets a soft fill instead of a different shape. */
defineProps<{ name: 'wardrobe' | 'pending' | 'outfits' | 'me'; active?: boolean }>()
</script>
<template>
  <em class="nav-glyph-box"><svg class="nav-glyph" :class="[`nav-glyph-${name}`, { active }]" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
    <template v-if="name === 'wardrobe'">
      <path class="fill" d="M3.5 18.5 12 12l8.5 6.5z" />
      <path d="M10 6.2a2 2 0 1 1 2.9 1.8c-.6.3-.9.8-.9 1.4V12M3.5 18.5 12 12l8.5 6.5z" />
    </template>
    <template v-else-if="name === 'pending'">
      <path class="fill" d="M4 13.5h4.2l1.3 2.2h5l1.3-2.2H20V19H4z" />
      <path d="M6.3 5h11.4L20 13.5V19H4v-5.5zM4 13.5h4.2l1.3 2.2h5l1.3-2.2H20" />
    </template>
    <template v-else-if="name === 'outfits'">
      <path class="fill" d="M9 4.5 4 7.2l1.7 3.6 1.8-.8V19.5h9V10l1.8.8L20 7.2l-5-2.7c-.4 1.3-1.6 2.2-3 2.2s-2.6-.9-3-2.2z" />
      <path d="M9 4.5 4 7.2l1.7 3.6 1.8-.8V19.5h9V10l1.8.8L20 7.2l-5-2.7c-.4 1.3-1.6 2.2-3 2.2s-2.6-.9-3-2.2z" />
    </template>
    <template v-else>
      <circle class="fill" cx="12" cy="8.5" r="3.5" />
      <circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c.9-3.4 3.7-5.4 7-5.4s6.1 2 7 5.4" />
    </template>
  </svg></em>
</template>
<style scoped>
/* The box is what the bar measures for its sliding pill; only the svg inside animates. */
.nav-glyph-box { display: block; flex: none; font-style: normal; line-height: 0; }
.nav-glyph { display: block; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.nav-glyph .fill { stroke: none; fill: currentColor; opacity: 0; transition: opacity .2s ease; }
.nav-glyph.active { stroke-width: 1.9; }
.nav-glyph.active .fill { opacity: .16; }
@media (prefers-reduced-motion: reduce) { .nav-glyph .fill { transition: none; } }
</style>
