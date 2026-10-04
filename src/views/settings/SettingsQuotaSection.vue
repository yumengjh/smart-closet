<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ThunderboltOutlined } from '@ant-design/icons-vue'
import { closetApi } from '../../services/api'

const quota = ref({ limit: 20, used: 0, resetAt: '' })
const error = ref('')
const remaining = computed(() => Math.max(0, quota.value.limit - quota.value.used))
const usedPercent = computed(() => Math.round(quota.value.used / quota.value.limit * 100))

onMounted(async () => {
  try { quota.value = await closetApi.quota() } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法加载额度。' }
})
</script>

<template>
  <div class="settings-section-content">
    <div class="settings-section-icon"><ThunderboltOutlined /></div>
    <p class="eyebrow">图像任务</p>
    <h2>今日 AI 额度</h2>
    <a-alert v-if="error" type="error" :message="error" show-icon style="margin-top:16px" />
    <p class="quota-numbers">
      <strong>{{ remaining }}</strong>
      <span> / {{ quota.limit }} 次还可以使用</span>
    </p>
    <a-progress :percent="usedPercent" :show-info="false" stroke-color="#202124" trail-color="#eceef2" />
    <div class="quota-legend">
      <span>已使用 {{ quota.used }} 次</span>
      <span>{{ remaining }} 次可用</span>
    </div>
    <p class="settings-hint">识别和图片整理合计算一次；本地贴纸不计入额度。每日按北京时间重置。</p>
    <p class="quota-reset">重置时间：{{ new Date(quota.resetAt || Date.now()).toLocaleString('zh-CN') }}</p>
  </div>
</template>
