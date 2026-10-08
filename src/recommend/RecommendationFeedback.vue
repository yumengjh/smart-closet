<script setup lang="ts">
import { ref } from 'vue'
import { App } from 'ant-design-vue'
import { DislikeOutlined, LikeOutlined } from '@ant-design/icons-vue'
import { playSound } from '../services/sound'
import { recommendApi } from './api'
import { FEEDBACK_REASONS, type RecommendedGarment, type Verdict } from './types'

const props = defineProps<{ logId: string | null; garments: RecommendedGarment[] }>()
const { message } = App.useApp()
const verdict = ref<Verdict | null>(null)
const open = ref(false)
const reasons = ref<string[]>([])
const garmentId = ref<string>()
const busy = ref(false)

async function submit(value: Verdict) {
  if (!props.logId || busy.value) return
  busy.value = true
  try {
    await recommendApi.feedback(props.logId, value, value === 'DOWN' ? reasons.value : [], value === 'DOWN' && reasons.value.includes('DISLIKE_ITEM') ? garmentId.value : undefined)
    verdict.value = value; open.value = false
    playSound(value === 'UP' ? 'success' : 'rise')
    message.success(value === 'UP' ? '已记下，之后会多推荐类似的搭配。' : '已记下，之后会尽量避开。')
  } catch (e) { message.error(e instanceof Error ? e.message : '反馈没有提交成功。') }
  finally { busy.value = false }
}
function toggle(value: string, checked: boolean) {
  reasons.value = checked ? [...reasons.value, value] : reasons.value.filter(r => r !== value)
}
</script>

<template>
  <div class="recommend-feedback" aria-label="对这套推荐的反馈">
    <a-tooltip title="喜欢这套"><a-button type="text" size="small" :disabled="!logId || busy" :class="{ 'is-active': verdict === 'UP' }" aria-label="喜欢这套" @click="submit('UP')"><LikeOutlined /></a-button></a-tooltip>
    <a-popover v-model:open="open" trigger="click" title="哪里不合适？" placement="topRight">
      <template #content>
        <div class="recommend-feedback-reasons">
          <a-checkable-tag v-for="r in FEEDBACK_REASONS" :key="r.value" :checked="reasons.includes(r.value)" @change="(c: boolean) => toggle(r.value, c)">{{ r.label }}</a-checkable-tag>
        </div>
        <a-select v-if="reasons.includes('DISLIKE_ITEM')" v-model:value="garmentId" size="small" placeholder="选择不喜欢的那件" class="recommend-feedback-item"
          :options="garments.map(g => ({ value: g.id, label: g.name }))" />
        <a-button type="primary" size="small" block :loading="busy" :disabled="!reasons.length || (reasons.includes('DISLIKE_ITEM') && !garmentId)" @click="submit('DOWN')">提交</a-button>
      </template>
      <a-button type="text" size="small" title="不合适" :disabled="!logId || busy" :class="{ 'is-active': verdict === 'DOWN' }" aria-label="不合适"><DislikeOutlined /></a-button>
    </a-popover>
  </div>
</template>
