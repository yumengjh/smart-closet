<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { activityOptions } from './situation'
import { recommendApi } from './api'
import { dateLocale } from './dateLocale'
import type { ActivityTags, Occasion } from './types'
import { OCCASIONS, type IntentInput } from './types'

/**
 * Intent bar (design 8.2): occasion, optional temperature, colours to avoid. Editing and re-running needs no model.
 * Occasions are one scrollable row of chips; with {@code autoRun} picking one recomputes at once, the button is for the rest.
 */
const props = withDefaults(defineProps<{ loading?: boolean; compact?: boolean; submitLabel?: string; autoRun?: boolean; allowAny?: boolean }>(), { submitLabel: '推荐' })
const intent = defineModel<IntentInput>({ required: true })
const emit = defineEmits<{ submit: [] }>()
const COLORS = ['亮色', '深色', '红色', '橙色', '黄色', '绿色', '蓝色', '紫色', '粉色', '黑色', '白色', '灰色', '米色', '棕色']
const occasion = computed<Occasion | ''>({ get: () => intent.value.occasion || '', set: v => { intent.value = { ...intent.value, occasion: v || undefined, activity: undefined } } })
const temperature = computed({ get: () => intent.value.temperatureC ?? null, set: v => { intent.value = { ...intent.value, temperatureC: v } } })
const avoid = computed({ get: () => intent.value.avoidColors || [], set: v => { intent.value = { ...intent.value, avoidColors: v } } })
const date = computed({ get: () => intent.value.date, set: value => { intent.value = { ...intent.value, date: value || undefined } } })
const place = computed({ get: () => intent.value.place || '', set: value => { intent.value = { ...intent.value, place: value || undefined } } })
const tags = ref<ActivityTags | null>(null)
const tagsError = ref(false)
async function loadActivities() {
  tagsError.value = false
  try { tags.value = await recommendApi.activities() } catch { tagsError.value = true }
}
const activities = computed(() => activityOptions(tags.value, intent.value.occasion))
onMounted(loadActivities)
function selectActivity(value: string) {
  intent.value = { ...intent.value, activity: intent.value.activity === value ? undefined : value }
  if (props.autoRun) emit('submit')
}
function pastDate(day: { valueOf(): number }) { const today = new Date(); today.setHours(0, 0, 0, 0); return day.valueOf() < today.getTime() }
function pick(value: typeof occasion.value) {
  if (value === occasion.value) return
  occasion.value = value
  if (props.autoRun) emit('submit')
}
</script>
<template>
  <form class="recommend-intent-bar" :class="{ 'is-compact': props.compact }" aria-label="推荐条件" @submit.prevent="emit('submit')">
    <div class="recommend-occasion-tags" role="radiogroup" aria-label="场景">
      <a-checkable-tag v-if="props.allowAny" :checked="!occasion" @change="pick('')">不限场景</a-checkable-tag>
      <a-checkable-tag v-for="o in (props.compact ? OCCASIONS.slice(0, 4) : OCCASIONS)" :key="o.value" role="radio" :aria-checked="occasion === o.value" :checked="occasion === o.value" @change="pick(o.value)">{{ o.label }}</a-checkable-tag>
    </div>
    <a-button v-if="tagsError" size="small" @click="loadActivities">活动加载失败，重试</a-button>
    <div v-if="activities.length" class="recommend-occasion-tags" aria-label="活动">
      <a-checkable-tag v-for="item in activities" :key="item.id" :checked="intent.activity === item.id" @change="selectActivity(item.id)">{{ item.label }}</a-checkable-tag>
    </div>
    <div class="recommend-intent-extra">
      <a-date-picker v-model:value="date" :locale="dateLocale" value-format="YYYY-MM-DD" :disabled-date="pastDate" placeholder="今天" aria-label="穿搭日期" :allow-clear="true" />
      <a-input v-model:value="place" :maxlength="40" placeholder="城市（默认常住城市）" aria-label="本次推荐城市" allow-clear style="width: 190px; max-width: 100%" />
      <a-input-number v-model:value="temperature" class="recommend-intent-temp" :min="-40" :max="50" :precision="0" placeholder="气温自动" addon-after="°C" aria-label="温度（可不填，默认按常住城市天气）" />
      <a-select v-if="!props.compact" v-model:value="avoid" class="recommend-intent-avoid" mode="multiple" :options="COLORS.map(c => ({ value: c, label: c }))" placeholder="避开颜色" :max-tag-count="1" :show-search="false" aria-label="避开的颜色" />
      <a-button type="primary" html-type="submit" :loading="props.loading">{{ props.submitLabel }}</a-button>
    </div>
  </form>
</template>
