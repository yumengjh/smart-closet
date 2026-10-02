<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '../stores/theme'

const theme = useThemeStore()
const actionLabel = computed(() => theme.isDark ? '切换到浅色主题' : '切换到深色主题')
</script>

<template>
  <a-tooltip :title="actionLabel">
    <a-button type="text" shape="circle" class="theme-toggle" :aria-label="actionLabel" @click="theme.toggle">
      <template #icon>
        <span class="anticon theme-icon" aria-hidden="true">
          <svg v-if="theme.isDark" viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
          </svg>
          <svg v-else viewBox="0 0 24 24" focusable="false">
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
          </svg>
        </span>
      </template>
    </a-button>
  </a-tooltip>
</template>
