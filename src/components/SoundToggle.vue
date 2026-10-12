<script setup lang="ts">
import { SoundOutlined, AudioMutedOutlined } from '@ant-design/icons-vue'
import { soundEnabled, toggleSound } from '../services/sound'
</script>

<template>
  <a-tooltip :title="soundEnabled ? '关闭音效 · 悬停、点击与操作反馈' : '开启音效 · 点击试听，记住本机选择'">
    <a-button type="text" class="sound-toggle" data-sound="off" :aria-label="soundEnabled ? '关闭音效' : '开启音效'" :aria-pressed="soundEnabled" @click="toggleSound">
      <component :is="soundEnabled ? SoundOutlined : AudioMutedOutlined" />
    </a-button>
  </a-tooltip>
</template>

<style scoped>
.sound-toggle.ant-btn { flex: none; width: 36px; min-width: 36px; height: 36px; padding: 0; }
.sound-toggle[aria-pressed="true"] { color: var(--accent-strong); background: var(--accent-soft); }
</style>
