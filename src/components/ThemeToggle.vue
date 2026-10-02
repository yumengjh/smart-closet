<script setup lang="ts">
import { computed } from 'vue'
import { BulbFilled, BulbOutlined } from '@ant-design/icons-vue'
import { useThemeStore } from '../stores/theme'

const theme = useThemeStore()
const actionLabel = computed(() => theme.isDark ? '切换到浅色主题' : '切换到深色主题')
</script>

<template>
  <a-tooltip :title="actionLabel">
    <a-button type="text" class="theme-toggle" :aria-label="actionLabel" @click="theme.toggle">
      <BulbFilled v-if="theme.isDark" />
      <BulbOutlined v-else />
    </a-button>
  </a-tooltip>
</template>
