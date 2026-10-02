<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '../stores/theme'

const theme = useThemeStore()
const actionLabel = computed(() => theme.isDark ? '切换到浅色主题' : '切换到深色主题')
</script>

<template>
  <a-tooltip :title="actionLabel">
    <a-button type="text" class="theme-toggle" :aria-label="actionLabel" @click="theme.toggle">
      <svg v-if="theme.isDark" class="theme-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </svg>
      <svg v-else class="theme-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M22 17A10 10 0 0 1 7 2.3 10 10 0 1 0 22 17Z" />
      </svg>
    </a-button>
  </a-tooltip>
</template>
