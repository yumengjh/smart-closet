<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { closetApi } from '../../services/api'
import { tokens } from '../../theme/tokens'
import { useThemeStore } from '../../stores/theme'

const appearance = useThemeStore()
const quota = ref({ limit: 20, used: 0, resetAt: '' })
const error = ref('')
const remaining = computed(() => Math.max(0, quota.value.limit - quota.value.used))
const usedPercent = computed(() => Math.round(quota.value.used / quota.value.limit * 100))
const progressColors = computed(() => {
  const t = tokens[appearance.isDark ? 'dark' : 'light']
  return { stroke: t.accent, trail: t.surfaceAlt }
})

onMounted(async () => {
  try { quota.value = await closetApi.quota() } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法加载额度。' }
})
</script>

<template>
  <div class="settings-section-content">
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <section class="settings-group">
      <header class="settings-group-head">
        <h3>今日 AI 额度</h3>
        <p>识别和图片整理合计算一次；本地贴纸不计入额度。</p>
      </header>
      <p class="quota-numbers">
        <strong>{{ remaining }}</strong>
        <span> / {{ quota.limit }} 次还可以使用</span>
      </p>
      <a-progress :percent="usedPercent" :show-info="false" :stroke-color="progressColors.stroke" :trail-color="progressColors.trail" />
      <div class="quota-legend">
        <span>已使用 {{ quota.used }} 次</span>
        <span>{{ remaining }} 次可用</span>
      </div>
      <p class="quota-reset">每日按北京时间重置 · 下次重置 {{ new Date(quota.resetAt || Date.now()).toLocaleString('zh-CN') }}</p>
    </section>
  </div>
</template>
