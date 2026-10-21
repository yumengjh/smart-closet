<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { playSound } from '../services/sound'
import { thumbUrl } from '../services/urls'
import { groupPresets, presetApi, presetName, type PresetItem } from '../services/presets'

/**
 * 从常见单品添加（预设衣物库设计 6.1）：用户勾选“我有类似的”，复制进自己的衣柜并标“预设”。默认不勾选（决策 P4）。
 * 性别按“男/女”看时，同时给出中性与未标注的基础款，后端只按精确值过滤，所以在这里合并。
 */
const props = withDefaults(defineProps<{ sex?: 'ALL' | 'FEMALE' | 'MALE'; styles?: string[]; compact?: boolean }>(), { sex: 'ALL', styles: () => [], compact: false })
const emit = defineEmits<{ imported: [count: number] }>()
const { message } = App.useApp()

const STYLE_OPTIONS = ['都市通勤', '高智极简', '美式休闲', '户外机能', '老钱风', '潮流运动', '工装风', '日系清新', '巴恩风', '法式', '新中式', '甜美'].map(value => ({ value, label: value }))
const SEX_OPTIONS = [{ value: 'ALL', label: '不限' }, { value: 'FEMALE', label: '女' }, { value: 'MALE', label: '男' }]
const SEASON_OPTIONS = [{ value: '', label: '不限' }, ...['春', '夏', '秋', '冬'].map(value => ({ value, label: value }))]

const items = ref<PresetItem[]>([]); const loading = ref(true); const error = ref(''); const saving = ref(false)
const sex = ref(props.sex); const styles = ref<string[]>([...props.styles]); const season = ref('')
const chosen = ref<Set<string>>(new Set())
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
function toggle(item: PresetItem, on: boolean) { const next = new Set(chosen.value); if (on) next.add(item.id); else next.delete(item.id); chosen.value = next }

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
    <div class="preset-filters">
      <a-segmented v-model:value="sex" :options="SEX_OPTIONS" aria-label="按性别看" />
      <a-segmented v-model:value="season" :options="SEASON_OPTIONS" aria-label="按季节看" />
      <a-select v-model:value="styles" mode="multiple" :options="STYLE_OPTIONS" :max-tag-count="2" allow-clear placeholder="风格（可不选）" class="preset-style-select" />
    </div>
    <a-alert v-if="error" type="warning" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-skeleton v-else-if="loading && !items.length" active />
    <a-empty v-else-if="!visible.length" description="暂时没有符合条件的常见单品" />
    <template v-else>
      <section v-for="g in groups" :key="g.group" class="preset-group">
        <h3>{{ g.group }} <small class="muted">{{ g.items.length }}</small></h3>
        <div class="preset-grid">
          <label v-for="item in g.items" :key="item.id" class="preset-card" :class="{ chosen: chosen.has(item.id), done: item.alreadyImported }">
            <img :src="thumbUrl(item.displayUrl, 320)" :alt="presetName(item)" loading="lazy" decoding="async" />
            <span class="preset-name">{{ presetName(item) }}</span>
            <a-tag v-if="item.alreadyImported">已在衣柜</a-tag>
            <a-checkbox v-else :checked="chosen.has(item.id)" @update:checked="toggle(item, Boolean($event))">我有类似的</a-checkbox>
          </label>
        </div>
      </section>
    </template>
    <div v-if="!compact" class="preset-footer">
      <span class="muted">已选 {{ chosen.size }} 件，加入后标“预设”，可随时换成自己的照片</span>
      <a-button type="primary" :disabled="!chosen.size" :loading="saving" @click="submit">加入衣柜</a-button>
    </div>
  </div>
</template>

<style scoped>
.preset-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.preset-style-select { min-width: 200px; flex: 1; }
.preset-group h3 { margin: 16px 0 8px; font-size: 15px; }
.preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
.preset-card { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; padding: 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); cursor: pointer; }
.preset-card.chosen { border-color: var(--ink); }
.preset-card.done { opacity: .6; cursor: default; }
.preset-card img { width: 100%; aspect-ratio: 1; object-fit: contain; background: var(--surface-alt); border-radius: 8px; }
.preset-name { font-size: 13px; line-height: 1.3; }
.preset-footer { position: sticky; bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0 0; margin-top: 12px; background: var(--surface); border-top: 1px solid var(--line); }
@media (max-width: 640px) { .preset-grid { grid-template-columns: repeat(2, 1fr); } .preset-footer { flex-direction: column; align-items: stretch; } }
</style>
