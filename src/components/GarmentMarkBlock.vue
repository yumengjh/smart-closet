<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { EditOutlined } from '@ant-design/icons-vue'
import { dateLocale } from '../recommend/dateLocale'
import { MAX_GARMENT_NOTE, MAX_TAGS, MAX_TAG_LENGTH, costPerWear, garmentMarkApi, minorToYuan, normalizeTags, yuanToMinor, type GarmentMark } from '../services/inspirations'
import { track } from '../services/analytics'
import { playSound } from '../services/sound'

/**
 * 我的记录（穿搭灵感设计 6.1）：标签、穿着备注、购买价格与日期，以及“穿了 N 次 · 每次约 ¥X”。
 * 只给自己看：不进推荐、不发给模型；改这里不升衣物 revision。种草（wanted）不记价格与日期。
 */
const props = defineProps<{ garmentId: string; wanted?: boolean; disabled?: boolean }>()
const { message } = App.useApp()
const mark = ref<GarmentMark | null>(null)
const error = ref('')
const editing = ref(false)
const saving = ref(false)
const tagOptions = ref<{ value: string }[]>([])
const form = ref({ tags: [] as string[], note: '', price: null as number | null, date: null as string | null })

async function load() {
  error.value = ''
  try { mark.value = await garmentMarkApi.get(props.garmentId) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '记录没有加载出来。' }
}
watch(() => props.garmentId, () => { mark.value = null; editing.value = false; void load() }, { immediate: true })

function edit() {
  const current = mark.value
  form.value = { tags: [...(current?.tags || [])], note: current?.note || '', price: minorToYuan(current?.purchasePriceMinor), date: current?.purchaseDate || null }
  editing.value = true
  void garmentMarkApi.tags().then(page => { tagOptions.value = page.items.map(item => ({ value: item.name })) }).catch(() => undefined)
}
function tagsChanged(values: string[]) { form.value.tags = normalizeTags(values) }
function futureDate(day: { valueOf(): number }) { return day.valueOf() > Date.now() }

async function save() {
  const before = mark.value
  saving.value = true
  try {
    const next = await garmentMarkApi.save(props.garmentId, {
      tags: form.value.tags,
      note: form.value.note.trim() || null,
      purchasePriceMinor: props.wanted ? null : yuanToMinor(form.value.price),
      purchaseCurrency: props.wanted || form.value.price == null ? null : 'CNY',
      purchaseDate: props.wanted ? null : form.value.date,
    })
    if (JSON.stringify(before?.tags || []) !== JSON.stringify(next.tags)) track('garment_marked', { field: 'tags' })
    if ((before?.note || null) !== next.note) track('garment_marked', { field: 'note' })
    if ((before?.purchasePriceMinor ?? null) !== next.purchasePriceMinor || (before?.purchaseDate || null) !== next.purchaseDate) track('garment_marked', { field: 'purchase' })
    mark.value = next; editing.value = false; playSound('success')
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有保存，请重试。') }
  finally { saving.value = false }
}

const perWear = computed(() => costPerWear(mark.value?.purchasePriceMinor, mark.value?.wearCount || 0))
const price = computed(() => mark.value?.purchasePriceMinor == null ? '' : `¥${(mark.value.purchasePriceMinor / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`)
const wornLine = computed(() => {
  const count = mark.value?.wearCount || 0
  if (!count) return props.wanted ? '' : '还没穿过'
  return `穿了 ${count} 次${mark.value?.lastWornOn ? ` · 最近 ${mark.value.lastWornOn.slice(5).replace('-', '月')}日` : ''}`
})
const empty = computed(() => !!mark.value && !mark.value.tags.length && !mark.value.note && mark.value.purchasePriceMinor == null && !mark.value.purchaseDate)
</script>

<template>
  <div class="info-block gm">
    <h2>我的记录<a-button v-if="mark && !editing && !disabled" type="text" size="small" class="gm-edit" aria-label="编辑我的记录" @click="edit"><EditOutlined /></a-button></h2>
    <a-alert v-if="error" type="warning" :message="error" show-icon><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-skeleton v-else-if="!mark" active :title="false" :paragraph="{ rows: 2 }" />
    <template v-else-if="!editing">
      <p v-if="wornLine" class="gm-worn">{{ wornLine }}<template v-if="perWear"> · 每次约 {{ perWear }}</template></p>
      <div v-if="mark.tags.length" class="gm-tags"><a-tag v-for="tag in mark.tags" :key="tag" :bordered="false">{{ tag }}</a-tag></div>
      <p v-if="mark.note" class="gm-note">{{ mark.note }}</p>
      <p v-if="price || mark.purchaseDate" class="gm-buy">{{ [price, mark.purchaseDate ? `${mark.purchaseDate} 买的` : ''].filter(Boolean).join(' · ') }}</p>
      <a-button v-if="empty && !disabled" type="link" size="small" class="info-link" @click="edit">加标签、记备注{{ wanted ? '' : '或价格' }}</a-button>
    </template>
    <div v-else class="gm-form">
      <label>标签</label>
      <a-select :value="form.tags" mode="tags" :options="tagOptions" :max-tag-text-length="MAX_TAG_LENGTH" :placeholder="`比如 面试、出差（最多 ${MAX_TAGS} 个）`" aria-label="标签" :token-separators="[',', '，', ' ']" @change="(values: unknown) => tagsChanged(values as string[])" />
      <label>备注</label>
      <a-textarea v-model:value="form.note" :maxlength="MAX_GARMENT_NOTE" show-count :auto-size="{ minRows: 2, maxRows: 4 }" placeholder="比如 偏大一码、要配安全裤" aria-label="穿着备注" />
      <template v-if="!wanted">
        <label>价格</label>
        <a-input-number v-model:value="form.price" :min="0" :max="1000000" :precision="2" prefix="¥" placeholder="可不填" aria-label="购买价格（元）" class="gm-price" />
        <label>买的日期</label>
        <a-date-picker v-model:value="form.date" :locale="dateLocale" value-format="YYYY-MM-DD" :disabled-date="futureDate" placeholder="可不填" aria-label="购买日期" />
      </template>
      <p class="gm-private">只有你自己看得到，不影响推荐。</p>
      <div class="gm-actions"><a-button @click="editing = false">取消</a-button><a-button type="primary" :loading="saving" @click="save">保存</a-button></div>
    </div>
  </div>
</template>

<style scoped>
.gm h2 { display: flex; align-items: center; gap: 4px; }
.gm-edit.ant-btn { margin-left: auto; color: var(--muted); }
.gm-worn, .gm-note, .gm-buy { margin: 0 0 6px; font-size: 14px; color: var(--ink); }
.gm-note { white-space: pre-line; color: var(--muted-strong); }
.gm-buy { color: var(--muted); font-size: 13px; }
.gm-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.gm-tags :deep(.ant-tag) { margin: 0; }
.gm-form { display: grid; gap: 6px; }
.gm-form > label { margin-top: 4px; color: var(--muted); font-size: 13px; }
.gm-price { width: 100%; }
.gm-private { margin: 4px 0 0; color: var(--muted-subtle); font-size: 12px; }
.gm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
</style>
