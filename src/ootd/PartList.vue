<script setup lang="ts">
// “这次穿上身”部位清单（server 设计 2026-11-21 4.1）：上身图、需要人物的创作效果和搭配编辑器的穿搭检查共用。
// 每行 = 部位 + 衣服（点一下可“这次不穿”）+ 一句备注；配饰行选位置；问题用 a-segmented 当场回答；
// 缺的部位写“还差下装 · 去加 ›”（由父组件决定去哪）；不穿的灰着列在末尾，点一下穿回来。没有整段红色报错。
import { computed, ref } from 'vue'
import { CheckOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons-vue'
import type { Review } from '../services/platform'
import { answerAsk, answered, askValue, fitView, positionOptions, positionValue, resetAnswer, setPosition, skipGarment, wearAgain, type FitFix, type FitGarment, type FitItem, type WearState } from './part-list'

const props = withDefaults(defineProps<{
  review: Review | null; garments: FitGarment[]; selected: string[]; wearRoles: Record<string, string>
  error?: string; disabled?: boolean; title?: string; details?: boolean
}>(), { error: '', disabled: false, title: '这次穿上身', details: false })
const emit = defineEmits<{ 'update:selected': [string[]]; 'update:wearRoles': [Record<string, string>]; fix: [FitFix]; retry: []; detail: [string] }>()

const root = ref<HTMLElement>()
const view = computed(() => fitView(props.review, props.garments, props.selected, { error: props.error }))
const order = computed(() => props.garments.map(item => item.id))
const state = (): WearState => ({ selected: props.selected, wearRoles: props.wearRoles })
const askTitle = computed(() => view.value.asks.length === 1 ? '有一件要你选' : `有 ${view.value.asks.length} 件要你选`)

function apply(next: WearState) {
  if (next.selected !== props.selected) emit('update:selected', next.selected)
  if (next.wearRoles !== props.wearRoles) emit('update:wearRoles', next.wearRoles)
}
function act(key: string | number, item: FitItem) {
  if (key === 'skip') apply(skipGarment(state(), item.garmentId))
  else if (key === 'reset') apply(resetAnswer(state(), item.garmentId))
  else if (key === 'detail') emit('detail', item.garmentId)
}
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** 点禁用的生成按钮时：滚到第一个要处理的地方并闪一下（减少动态效果时只滚动）。 */
function focusFirst() {
  const key = view.value.first
  const target = (key && root.value?.querySelector<HTMLElement>(`[data-fit="${key}"]`)) || root.value
  if (!target) return false
  target.scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' })
  if (!calm()) { target.classList.remove('pl-flash'); void target.offsetWidth; target.classList.add('pl-flash'); window.setTimeout(() => target.classList.remove('pl-flash'), 1300) }
  return true
}
defineExpose({ focusFirst })
</script>

<template>
  <section ref="root" class="pl" :aria-label="title">
    <header class="pl-head">
      <h3>{{ title }}</h3>
      <span v-if="view.status.text" class="pl-status" :class="view.status.tone" role="status"><CheckOutlined v-if="view.status.tone === 'ok'" />{{ view.status.text }}</span>
    </header>

    <a-skeleton v-if="!review && !error" active :title="false" :paragraph="{ rows: 2, width: ['72%', '48%'] }" class="pl-wait" />
    <p v-else-if="!review" class="pl-retry">暂时没查到这套能不能穿上身<a-button type="link" size="small" @click="emit('retry')">再查一次</a-button></p>

    <template v-else>
      <div v-for="issue in view.issues" :key="issue.key" :data-fit="issue.key" class="pl-row pl-issue">
        <span class="pl-msg warn">{{ issue.message }}</span>
        <a-button v-if="issue.fix && !disabled" type="link" size="small" class="pl-fix" @click="emit('fix', issue.fix)">去换 <RightOutlined /></a-button>
      </div>

      <div v-for="row in view.rows" :key="row.key" :data-fit="row.key" class="pl-row" :class="{ missing: row.blocking && !row.items.length }">
        <span class="pl-part">{{ row.label }}</span>
        <div class="pl-items">
          <template v-if="row.items.length">
            <div v-for="item in row.items" :key="item.garmentId" class="pl-item">
              <a-dropdown :trigger="['click']" :disabled="disabled">
                <a-button type="text" class="pl-garment" :aria-label="`${item.label}，点一下可这次不穿`">
                  <img v-if="item.thumb" :src="item.thumb" alt="" loading="lazy" /><span v-else class="pl-thumb-empty" />
                  <b>{{ item.label }}</b>
                </a-button>
                <template #overlay>
                  <a-menu @click="({ key }: { key: string | number }) => act(key, item)">
                    <a-menu-item key="skip">这次不穿</a-menu-item>
                    <a-menu-item v-if="answered(wearRoles, item.garmentId)" key="reset">重新选穿法</a-menu-item>
                    <a-menu-item v-if="details" key="detail">看单品资料</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
              <a-select v-if="item.accessory" size="small" class="pl-position" :bordered="false" :disabled="disabled" :value="positionValue(item, wearRoles)" :options="positionOptions(item)" :aria-label="`${item.label}戴在哪里`" @update:value="(value: string) => apply(setPosition(state(), item.garmentId, value))" />
              <span v-else-if="item.note" class="pl-note">{{ item.note }}</span>
            </div>
          </template>
          <span v-else class="pl-msg" :class="{ warn: row.blocking }">{{ row.message }}</span>
        </div>
        <a-button v-if="!row.items.length && row.fix && !disabled" type="link" size="small" class="pl-fix" @click="emit('fix', row.fix)">去加 <RightOutlined /></a-button>
      </div>

      <div v-if="view.asks.length" class="pl-asks">
        <p class="pl-divider"><span>{{ askTitle }}</span></p>
        <div v-for="ask in view.asks" :key="ask.key" :data-fit="ask.key" class="pl-ask">
          <p class="pl-ask-q">
            <span class="pl-ask-thumbs"><template v-for="g in ask.garments" :key="g.id"><img v-if="g.thumb" :src="g.thumb" alt="" loading="lazy" /><span v-else class="pl-thumb-empty" /></template></span>
            <b v-if="ask.code === 'CHOOSE_PART'">{{ ask.garments[0]?.label }}</b>
            <span>{{ ask.message }}</span>
          </p>
          <a-segmented class="pl-seg" :value="askValue(ask, { selected, wearRoles })" :options="ask.options" :disabled="disabled" @change="(value: string | number) => apply(answerAsk(state(), ask, String(value), order))" />
        </div>
      </div>

      <div v-if="view.skipped.length" class="pl-row pl-skipped" data-fit="skipped">
        <span class="pl-part">这次不穿</span>
        <div class="pl-items pl-chips">
          <a-button v-for="g in view.skipped" :key="g.id" size="small" class="pl-chip" :disabled="disabled" :aria-label="`${g.label}，点一下穿回来`" @click="apply(wearAgain(state(), g.id, order))">
            <img v-if="g.thumb" :src="g.thumb" alt="" loading="lazy" /><span>{{ g.label }}</span><PlusOutlined />
          </a-button>
        </div>
      </div>

      <p v-for="note in view.notes" :key="note" class="pl-legacy-note">{{ note }}</p>
    </template>
  </section>
</template>

<style scoped>
.pl { display: grid; gap: 0; margin-top: 18px; }
.pl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 6px; }
.pl-head h3 { margin: 0; font-size: 14px; font-weight: 600; }
.pl-status { display: inline-flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; font-size: 13px; color: var(--muted-strong); text-overflow: ellipsis; white-space: nowrap; }
.pl-status.ok { color: var(--success); }
.pl-status.block { color: var(--danger); }
.pl-wait { padding: 8px 0; }
.pl-retry { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 6px 0; font-size: 13px; color: var(--muted-strong); }
.pl-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; min-height: 48px; padding: 6px 0; border-top: 1px solid var(--line); border-radius: 0; }
.pl-issue { grid-template-columns: minmax(0, 1fr) auto; }
.pl-part { font-size: 13px; color: var(--muted-strong); }
.pl-items { display: grid; gap: 4px; min-width: 0; }
.pl-item { display: flex; align-items: center; gap: 8px; min-width: 0; }
.pl-garment.ant-btn { display: inline-flex; flex: 0 1 auto; align-items: center; gap: 8px; min-width: 0; max-width: 100%; height: 40px; padding: 2px 6px 2px 2px; color: var(--ink); }
.pl-garment img, .pl-thumb-empty { flex: none; width: 36px; height: 36px; border-radius: 6px; background: var(--surface-alt); object-fit: contain; }
.pl-thumb-empty { display: inline-block; }
.pl-garment b { overflow: hidden; font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.pl-note { flex: none; margin-left: auto; font-size: 12px; color: var(--muted); white-space: nowrap; }
.pl-position { flex: none; margin-left: auto; min-width: 104px; }
.pl-position :deep(.ant-select-selector) { padding-inline: 4px !important; }
.pl-position :deep(.ant-select-selection-item) { font-size: 12px; color: var(--muted-strong); text-align: right; }
.pl-msg { font-size: 13px; color: var(--muted); }
.pl-msg.warn { color: var(--danger); }
.pl-fix.ant-btn { display: inline-flex; align-items: center; gap: 2px; padding-inline: 4px; color: var(--ink); font-size: 13px; }
.pl-fix :deep(.anticon) { font-size: 10px; }
.pl-asks { display: grid; gap: 12px; padding: 4px 0 10px; border-top: 1px solid var(--line); }
.pl-divider { display: flex; align-items: center; gap: 10px; margin: 8px 0 0; font-size: 12px; color: var(--muted-strong); }
.pl-divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.pl-ask { display: grid; gap: 8px; border-radius: var(--radius-md); }
.pl-ask-q { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 0; font-size: 14px; }
.pl-ask-q b { font-weight: 500; }
.pl-ask-q > span:last-child { color: var(--muted-strong); }
.pl-ask-thumbs { display: inline-flex; gap: 4px; }
.pl-ask-thumbs img, .pl-ask-thumbs .pl-thumb-empty { width: 32px; height: 32px; border-radius: 6px; background: var(--surface-alt); object-fit: contain; }
.pl-seg { max-width: 100%; }
.pl-seg :deep(.ant-segmented-group) { flex-wrap: wrap; row-gap: 4px; }
.pl-seg :deep(.ant-segmented-item-label) { max-width: 10em; overflow: hidden; text-overflow: ellipsis; }
.pl-skipped { grid-template-columns: 56px minmax(0, 1fr); }
.pl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pl-chip.ant-btn { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; height: 32px; padding: 0 8px 0 3px; color: var(--muted); }
.pl-chip img { width: 26px; height: 26px; border-radius: 4px; object-fit: contain; opacity: .55; filter: grayscale(1); }
.pl-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-chip :deep(.anticon) { font-size: 10px; }
.pl-legacy-note { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
.pl-flash { animation: pl-flash 1.2s ease-out; }
@keyframes pl-flash { 0%, 35% { background: var(--warning-bg); box-shadow: 0 0 0 6px var(--warning-bg); } 100% { background: transparent; box-shadow: 0 0 0 6px transparent; } }
@media (prefers-reduced-motion: reduce) { .pl-flash { animation: none; } }
</style>
