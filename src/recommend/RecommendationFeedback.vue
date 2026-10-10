<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { App } from 'ant-design-vue'
import { DislikeOutlined, LikeOutlined } from '@ant-design/icons-vue'
import { playSound } from '../services/sound'
import { recommendApi } from './api'
import { FEEDBACK_REASONS, GARMENT_REASONS, type RecommendedGarment, type Verdict } from './types'

const props = defineProps<{ logId: string | null; garments: RecommendedGarment[] }>()
const { message } = App.useApp()
const verdict = ref<Verdict | null>(null)
const open = ref(false)
const reasons = ref<string[]>([])
const garmentId = ref<string>()
const busy = ref(false)
/** 不喜欢某一件 / 品类识别错了 are about one garment; 不成套 picks the outfit's only garment on the server. */
const needsGarment = computed(() => reasons.value.some(r => (GARMENT_REASONS as readonly string[]).includes(r)))

async function submit(value: Verdict) {
  if (!props.logId || busy.value) return
  busy.value = true
  try {
    const answer = await recommendApi.feedback(props.logId, value, value === 'DOWN' ? reasons.value : [], value === 'DOWN' && needsGarment.value ? garmentId.value : undefined)
    verdict.value = value; open.value = false
    playSound(value === 'UP' ? 'success' : 'rise')
    if (answer.doubted) {
      const { garmentId: id, name } = answer.doubted
      message.success({ content: h('span', ['已暂停推荐「' + name + '」，', h(RouterLink, { to: `/garment/${id}` }, () => '去核对品类'), '，修改或确认后恢复推荐。']), duration: 6 })
    } else message.success(value === 'UP' ? '已记下，之后会多推荐类似的搭配。' : '已记下，之后会尽量避开。')
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
        <a-select v-if="needsGarment" v-model:value="garmentId" size="small" :placeholder="reasons.includes('WRONG_CATEGORY') ? '选择品类识别错的那件' : '选择不喜欢的那件'" class="recommend-feedback-item"
          :options="garments.map(g => ({ value: g.id, label: g.name }))" />
        <a-button type="primary" size="small" block :loading="busy" :disabled="!reasons.length || (needsGarment && !garmentId)" @click="submit('DOWN')">提交</a-button>
      </template>
      <a-button type="text" size="small" title="不合适" :disabled="!logId || busy" :class="{ 'is-active': verdict === 'DOWN' }" aria-label="不合适"><DislikeOutlined /></a-button>
    </a-popover>
  </div>
</template>
