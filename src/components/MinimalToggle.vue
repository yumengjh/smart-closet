<script setup lang="ts">
import { computed } from 'vue'
import { usePreferencesStore } from '../stores/preferences'

const preferences = usePreferencesStore()
const label = computed(() => preferences.minimal ? '退出极简模式' : '极简模式：隐藏说明文字和次要按钮')
</script>

<template>
  <a-tooltip :title="label">
    <a-button type="text" shape="circle" class="minimal-toggle" :class="{ on: preferences.minimal }" :aria-label="label" :aria-pressed="preferences.minimal" @click="preferences.toggle">
      <template #icon>
        <span class="anticon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path v-if="preferences.minimal" d="M5 12h14" /><template v-else><path d="M5 7h14M5 12h10M5 17h6" /></template></svg>
        </span>
      </template>
    </a-button>
  </a-tooltip>
</template>

<style scoped>
.minimal-toggle svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.minimal-toggle.on { color: var(--accent); background: var(--accent-soft); }
</style>
