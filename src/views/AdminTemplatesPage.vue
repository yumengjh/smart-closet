<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { request } from '../services/api'
import { playSound } from '../services/sound'
import TemplatePreview from '../components/TemplatePreview.vue'

/** 搭配模板审核 (D31): review state lives in the database and overrides the file defaults; changes apply to the next recommendation. */
defineProps<{ embedded?: boolean }>()
type Slot = { roles: string[]; categoryAny: string[]; colorAny: string[]; styleAny: string[]; patternMax: number | null; fitAny?: string[]; patternMin?: number | null; describe?: string[] }
type Meta = { kind: 'CLASSIC' | 'TREND'; audience: string[]; occasions: string[]; seasons: string[]; validFrom: string | null; validUntil: string | null; reference: string }
type Entry = { id: string; text: string; bonus: number; defaultBonus: number; enabled: boolean; reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'; reviewedBy: string | null; reviewedAtMs: number; slots: Slot[]; meta?: Meta }
const { message } = App.useApp()
const items = ref<Entry[]>([]); const active = ref(0); const loading = ref(true); const error = ref(''); const busy = ref('')
const selected = ref<string[]>([]); const filter = ref<'ALL' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'>('PENDING_REVIEW')
const STATUS: Record<string, { label: string; color: string }> = { PENDING_REVIEW: { label: '待审核', color: 'default' }, APPROVED: { label: '已通过', color: 'green' }, REJECTED: { label: '已停用', color: 'red' } }
const ROLE: Record<string, string> = { TOP: '上装', BOTTOM: '下装', ONE_PIECE: '连衣裙/连体', OVERALL: '背带裙/背带裤', SHOES: '鞋', HAT: '帽', HEADWEAR: '头饰', BAG: '包', HANDHELD: '手持物', SOCKS: '袜子/裤袜', OUTER: '外层' }
const COLOR: Record<string, string> = { BLACK: '黑', WHITE: '白', GRAY: '灰', BEIGE: '米', BROWN: '棕', NAVY: '藏蓝', DENIM: '牛仔蓝', BLUE: '蓝', RED: '红', ORANGE: '橙', YELLOW: '黄', GREEN: '绿', PURPLE: '紫', PINK: '粉' }
const kind = ref<'ALL' | 'CLASSIC' | 'TREND'>('ALL')
const shown = computed(() => items.value.filter(i => (filter.value === 'ALL' || i.reviewStatus === filter.value) && (kind.value === 'ALL' || (i.meta?.kind || 'CLASSIC') === kind.value)))
const AUDIENCE: Record<string, string> = { FEMALE: '女', MALE: '男' }
const OCCASION: Record<string, string> = { DAILY: '日常', COMMUTE: '通勤', DATE: '约会', SPORT: '运动', OUTDOOR: '户外', FORMAL: '正式', TRAVEL: '度假', HOME: '居家' }
function metaText(m?: Meta) {
  if (!m) return ''
  const parts = [m.audience.length ? '适合' + m.audience.map(a => AUDIENCE[a] || a).join('/') : '男女皆可']
  if (m.seasons.length) parts.push(m.seasons.join('/') + '季')
  if (m.occasions.length) parts.push(m.occasions.map(o => OCCASION[o] || o).join('/'))
  if (m.kind === 'TREND') parts.push(`有效期 ${m.validFrom || '—'} 至 ${m.validUntil || '—'}`)
  return parts.join(' · ')
}
function expired(m?: Meta) { return !!m?.validUntil && m.validUntil < new Date().toISOString().slice(0, 10) }
function slotText(s: Slot) {
  const parts = [s.roles.map(r => ROLE[r] || r).join('/') || '任意位置']
  if (s.categoryAny.length) parts.push(s.categoryAny.join('/'))
  if (s.colorAny.length) parts.push('颜色 ' + s.colorAny.map(c => COLOR[c] || c).join('/'))
  if (s.styleAny.length) parts.push('风格 ' + s.styleAny.join('/'))
  if (s.patternMax !== null && s.patternMax !== undefined) parts.push(s.patternMax === 0 ? '纯色' : `花纹≤${s.patternMax}`)
  if (s.patternMin) parts.push('需带花纹')
  if (s.fitAny?.length) parts.push('版型 ' + s.fitAny.join('/'))
  return parts.join('，')
}
async function load() {
  loading.value = true; error.value = ''
  try { const r = await request<{ items: Entry[]; active: number }>('/api/admin/outfit-templates'); items.value = r.items; active.value = r.active }
  catch (e) { error.value = e instanceof Error ? e.message : '模板列表暂时无法加载。' }
  finally { loading.value = false }
}
onMounted(load)
async function review(id: string, body: Record<string, unknown>) {
  busy.value = id
  try {
    const next = await request<Entry>(`/api/admin/outfit-templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })
    items.value = items.value.map(i => i.id === id ? next : i); active.value = items.value.filter(i => i.reviewStatus === 'APPROVED' && i.enabled).length; playSound('tap')
  } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '保存失败。') }
  finally { busy.value = '' }
}
async function batch(status: 'APPROVED' | 'REJECTED') {
  busy.value = 'batch'
  try {
    await request('/api/admin/outfit-templates/review', { method: 'POST', body: JSON.stringify({ ids: selected.value, reviewStatus: status }) })
    message.success(`已${status === 'APPROVED' ? '通过' : '停用'} ${selected.value.length} 条。`); selected.value = []; await load(); playSound('success')
  } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '批量操作失败。') }
  finally { busy.value = '' }
}
const columns = [
  { title: '示意', key: 'preview', width: 112 }, { title: '搭法', key: 'text' }, { title: '条件', key: 'slots' }, { title: '加分', key: 'bonus', width: 120 }, { title: '状态', key: 'status', width: 110 }, { title: '操作', key: 'actions', width: 200 },
]
</script>
<template>
  <header v-if="!embedded" class="page-heading"><div><h1>搭配模板审核</h1><p>通过并启用的模板命中时加分（最多 5 分），卡片显示“经典搭法”。审核结果存数据库，立即生效，不改动资源文件。</p></div></header>
  <div class="settings-section-content">
    <a-alert v-if="error" type="error" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <div class="template-review-toolbar">
      <a-segmented v-model:value="filter" :options="[{ value: 'PENDING_REVIEW', label: '待审核' }, { value: 'APPROVED', label: '已通过' }, { value: 'REJECTED', label: '已停用' }, { value: 'ALL', label: '全部' }]" />
      <a-segmented v-model:value="kind" :options="[{ value: 'ALL', label: '全部类型' }, { value: 'CLASSIC', label: '经典' }, { value: 'TREND', label: '流行' }]" />
      <span class="muted">共 {{ items.length }} 条 · 生效 {{ active }} 条</span>
      <a-button type="primary" :disabled="!selected.length" :loading="busy === 'batch'" @click="batch('APPROVED')">批量通过（{{ selected.length }}）</a-button>
      <a-button :disabled="!selected.length" :loading="busy === 'batch'" @click="batch('REJECTED')">批量停用</a-button>
    </div>
    <a-table class="template-review-table" :data-source="shown" :columns="columns" row-key="id" size="small" :loading="loading" :pagination="{ pageSize: 20 }" :scroll="{ x: 880 }"
      :row-selection="{ selectedRowKeys: selected, onChange: (keys: (string | number)[]) => { selected = keys.map(String) } }">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'preview'">
          <a-popover placement="right" :title="record.text">
            <template #content><div class="template-preview-large"><TemplatePreview :slots="record.slots" :size="180" :uid="`l-${record.id}`" /><ul><li v-for="(s, i) in record.slots" :key="i">{{ s.describe?.length ? s.describe.join(' 或 ') : slotText(s) }}</li></ul></div></template>
            <TemplatePreview :slots="record.slots" :uid="`s-${record.id}`" />
          </a-popover>
        </template>
        <template v-else-if="column.key === 'text'"><strong>{{ record.text }}</strong> <a-tag v-if="record.meta?.kind === 'TREND'" color="magenta">流行</a-tag><a-tag v-if="expired(record.meta)">已过期</a-tag><br /><small class="muted">{{ metaText(record.meta) }}</small><br /><small v-if="record.meta?.reference" class="muted">参考：{{ record.meta.reference }}</small><br /><small class="muted">{{ record.id }}</small></template>
        <template v-else-if="column.key === 'slots'"><ul class="template-review-slots"><li v-for="(s, i) in record.slots" :key="i">{{ slotText(s) }}<template v-if="s.describe?.length"><br /><small class="muted">例：{{ s.describe.join('、') }}</small></template></li></ul></template>
        <template v-else-if="column.key === 'bonus'"><a-input-number :value="record.bonus" :min="0" :max="5" :step="0.5" size="small" :disabled="busy === record.id" aria-label="加分" @change="(v: number | string | null) => v !== null && Number(v) !== record.bonus && review(record.id, { bonus: Number(v) })" /></template>
        <template v-else-if="column.key === 'status'"><a-tag :color="STATUS[record.reviewStatus].color">{{ STATUS[record.reviewStatus].label }}</a-tag><a-tag v-if="!record.enabled">已关闭</a-tag></template>
        <template v-else-if="column.key === 'actions'">
          <a-space wrap>
            <a-button v-if="record.reviewStatus !== 'APPROVED'" size="small" type="primary" :loading="busy === record.id" @click="review(record.id, { reviewStatus: 'APPROVED', enabled: true })">通过</a-button>
            <a-button v-if="record.reviewStatus !== 'REJECTED'" size="small" :loading="busy === record.id" @click="review(record.id, { reviewStatus: 'REJECTED' })">停用</a-button>
            <a-button v-if="record.reviewStatus !== 'PENDING_REVIEW'" size="small" type="link" :loading="busy === record.id" @click="review(record.id, { reviewStatus: 'PENDING_REVIEW' })">退回待审</a-button>
          </a-space>
        </template>
      </template>
    </a-table>
  </div>
</template>
<style scoped>
.template-preview-large { display: flex; gap: 14px; align-items: flex-start; max-width: 420px; }
.template-preview-large ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.8; }
.template-review-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
</style>
