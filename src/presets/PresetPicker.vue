<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { CheckOutlined } from '@ant-design/icons-vue'
import { playSound } from '../services/sound'
import { thumbUrl } from '../services/urls'
import { groupPresets, presetApi, presetName, type PresetItem } from '../services/presets'

/**
 * 从常见单品添加（预设衣物库设计 6.1；预设衣物管理与引导封面设计 5.2）：点整张卡片选中“我有类似的”，复制进自己的衣柜并标“预设”。
 * 默认不选（决策 P4）。性别按“男/女”看时，同时给出中性与未标注的基础款，后端只按精确值过滤，所以在这里合并。
 * compact：嵌在别的弹窗里（PresetOnboarding），不带说明和底部操作栏，由外层调用 submit。
 */
const props = withDefaults(defineProps<{ sex?: 'ALL' | 'FEMALE' | 'MALE'; styles?: string[]; compact?: boolean }>(), { sex: 'ALL', styles: () => [], compact: false })
const emit = defineEmits<{ imported: [count: number] }>()
const { message } = App.useApp()

const STYLE_OPTIONS = ['都市通勤', '高智极简', '美式休闲', '户外机能', '老钱风', '潮流运动', '工装风', '日系清新', '巴恩风', '法式', '新中式', '甜美'].map(value => ({ value, label: value }))
const SEX_OPTIONS = [{ value: 'ALL', label: '不限' }, { value: 'FEMALE', label: '女' }, { value: 'MALE', label: '男' }]
const SEASON_OPTIONS = [{ value: '', label: '四季' }, ...['春', '夏', '秋', '冬'].map(value => ({ value, label: value }))]
const ALL = '全部'

const items = ref<PresetItem[]>([]); const loading = ref(true); const error = ref(''); const saving = ref(false)
const sex = ref(props.sex); const styles = ref<string[]>([...props.styles]); const season = ref('')
const chosen = ref<Set<string>>(new Set()); const tab = ref<string>(ALL)
const list = ref<HTMLElement | null>(null)
watch(() => props.sex, v => { sex.value = v }); watch(() => props.styles, v => { styles.value = [...v] })

async function load() {
  loading.value = true; error.value = ''
  try { items.value = await presetApi.list(season.value ? { season: season.value } : {}) }
  catch (e) { error.value = e instanceof Error ? e.message : '常见单品暂时无法加载。' }
  finally { loading.value = false }
}
onMounted(load)
watch(season, load)

const fits = (item: PresetItem) => sex.value === 'ALL' || item.gender !== (sex.value === 'MALE' ? '女款' : '男款')
const styled = (item: PresetItem) => !styles.value.length || item.styles.some(s => styles.value.includes(s)) || !item.styles.length
const visible = computed(() => items.value.filter(item => fits(item) && styled(item)))
const groups = computed(() => groupPresets(visible.value))
/** 只显示有内容的组；当前组被筛没了就回到“全部”。 */
const tabs = computed(() => [{ key: ALL, count: visible.value.length }, ...groups.value.map(g => ({ key: g.group as string, count: g.items.length }))])
const current = computed(() => tabs.value.some(t => t.key === tab.value) ? tab.value : ALL)
const shown = computed(() => current.value === ALL ? groups.value.flatMap(g => g.items) : groups.value.find(g => g.group === current.value)?.items || [])
function pickTab(key: string) {
  tab.value = key
  void nextTick(() => { const box = list.value; if (box && !props.compact) box.scrollTop = 0 })
}

function toggle(item: PresetItem) {
  if (item.alreadyImported || saving.value) return
  const next = new Set(chosen.value); if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
  chosen.value = next; playSound('tick')
}
function clear() { chosen.value = new Set() }

async function submit() {
  if (!chosen.value.size) return
  saving.value = true
  try {
    const result = await presetApi.importInto([...chosen.value].slice(0, 100))
    playSound('success'); message.success(`已加入 ${result.garmentIds.length} 件。这些是示意图，之后可以换成你自己的照片。`)
    chosen.value = new Set(); emit('imported', result.garmentIds.length); await load()
  } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '没有加入成功。') }
  finally { saving.value = false }
}
defineExpose({ submit, chosenCount: computed(() => chosen.value.size) })
</script>

<template>
  <div class="preset-picker" :class="{ compact }">
    <header class="pp-head">
      <p v-if="!compact" class="pp-intro">有类似的就点一下，加入后标“预设”，之后可以换成自己的照片。</p>
      <div class="pp-filters">
        <a-segmented v-model:value="sex" :options="SEX_OPTIONS" aria-label="按性别看" />
        <a-select v-model:value="season" :options="SEASON_OPTIONS" class="pp-season" aria-label="按季节看" />
        <a-select v-model:value="styles" mode="multiple" :options="STYLE_OPTIONS" :max-tag-count="1" allow-clear placeholder="风格" class="pp-style" aria-label="按风格看" />
      </div>
    </header>
    <div ref="list" class="pp-body">
      <nav v-if="tabs.length > 2" class="pp-tabs" aria-label="按品类看">
        <a-button v-for="t in tabs" :key="t.key" class="pp-tab" :class="{ on: current === t.key }" :aria-pressed="current === t.key" @click="pickTab(t.key)">{{ t.key }}<small>{{ t.count }}</small></a-button>
      </nav>
      <a-alert v-if="error" type="warning" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
      <a-skeleton v-else-if="loading && !items.length" active />
      <a-empty v-else-if="!visible.length" description="暂时没有符合条件的常见单品" />
      <div v-else class="pp-grid" :aria-busy="loading">
        <a-button v-for="item in shown" :key="item.id" class="pp-card" :class="{ on: chosen.has(item.id), done: item.alreadyImported }" :aria-pressed="item.alreadyImported ? undefined : chosen.has(item.id)" :disabled="item.alreadyImported"
          :title="item.ownSource ? '这件就是用你衣柜里的衣物做成的' : undefined" @click="toggle(item)">
          <img :src="thumbUrl(item.displayUrl, 320)" :alt="presetName(item)" loading="lazy" decoding="async" />
          <span v-if="!item.alreadyImported" class="pp-check" aria-hidden="true"><CheckOutlined /></span>
          <small>{{ item.alreadyImported ? (item.ownSource ? '你的衣物' : '已在衣柜') : presetName(item) }}</small>
        </a-button>
      </div>
    </div>
    <footer v-if="!compact" class="pp-bar">
      <span class="pp-count">已选 {{ chosen.size }} 件<template v-if="chosen.size">&nbsp;·&nbsp;<a-button type="link" size="small" class="pp-clear" :disabled="saving" @click="clear">清空</a-button></template></span>
      <a-button type="primary" :disabled="!chosen.size" :loading="saving" @click="submit">加入衣柜</a-button>
    </footer>
  </div>
</template>

<style scoped>
/* 在抽屉里：头部和底部操作栏固定，中间滚动；抽屉 body 不留内边距（WardrobePage）。 */
.preset-picker:not(.compact) { display: flex; flex: 1; flex-direction: column; height: 100%; min-height: 0; }
.preset-picker:not(.compact) .pp-head { flex: none; padding: 12px 20px 0; }
.preset-picker:not(.compact) .pp-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 20px 16px; overscroll-behavior: contain; }
.pp-intro { margin: 0 0 10px; font-size: 13px; color: var(--muted-strong); }
.pp-filters { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; margin: 0 -20px; padding: 0 20px 10px; overflow-x: auto; scrollbar-width: none; }
.compact .pp-filters { margin: 0; padding: 0 0 10px; }
.pp-filters::-webkit-scrollbar { display: none; }
.pp-filters > * { flex: none; }
.pp-season { width: 88px; }
.pp-style { width: 180px; }
.pp-tabs { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; margin: 0 -20px 12px; padding: 4px 20px 10px; overflow-x: auto; scrollbar-width: none; background: var(--surface); }
.compact .pp-tabs { margin: 0 0 12px; padding: 4px 0 10px; }
.pp-tabs::-webkit-scrollbar { display: none; }
.pp-tab.ant-btn { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 32px; padding: 0 14px; border: 0; border-radius: 999px; color: var(--muted-strong); background: var(--surface-alt); box-shadow: none; }
.pp-tab.ant-btn small { font-size: 12px; opacity: .7; }
.pp-tab.on.ant-btn, html .pp-tab.on.ant-btn:hover { color: var(--action-fg); background: var(--action-bg); }
.pp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.pp-grid[aria-busy="true"] { opacity: .6; transition: opacity .15s; }
.pp-card.ant-btn { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 4px; height: auto; padding: 0; border: 0; border-radius: 12px; background: none; box-shadow: none; color: var(--ink); text-align: left; white-space: normal; transition: transform .2s var(--spring); }
.pp-card.ant-btn:not(:disabled):active { transform: scale(.97); }
html .pp-card.ant-btn:not(:disabled):hover { background: none; color: var(--ink); }
.pp-card img { width: 100%; aspect-ratio: 3 / 4; object-fit: contain; padding: 8px; border-radius: 12px; background: var(--surface-alt); transition: box-shadow .15s ease; }
.pp-card.on img { box-shadow: 0 0 0 2px var(--ink); }
.pp-card small { overflow: hidden; padding: 0 2px; font-size: 12px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.pp-card.done.ant-btn, .pp-card.done.ant-btn:disabled { opacity: .55; cursor: default; background: none; }
.pp-check { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: transparent; background: var(--surface); box-shadow: 0 0 0 1.5px var(--line); font-size: 12px; transition: all .2s var(--spring); }
.on > .pp-check { color: var(--action-fg); background: var(--action-bg); box-shadow: none; transform: scale(1.08); }
.pp-bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--surface); }
.pp-count { display: inline-flex; align-items: center; font-size: 14px; color: var(--muted-strong); }
.pp-clear.ant-btn { height: auto; padding: 0 2px; }
@media (max-width: 640px) { .pp-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } }
@media (prefers-reduced-motion: reduce) { .pp-card.ant-btn, .pp-card img, .pp-check, .pp-grid { transition: none; } .pp-card.ant-btn:not(:disabled):active { transform: none; } .on > .pp-check { transform: none; } }
</style>
