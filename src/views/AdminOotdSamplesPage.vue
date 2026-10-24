<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { request } from '../services/api'
import { apiUrl } from '../services/urls'
import { playSound } from '../services/sound'
import { ROLE_LABELS } from '../recommend/types'

/**
 * 整套穿搭样本 (design 2026-10-09 §6): upload a whole-outfit photo, one model call extracts items and presentation,
 * an admin checks and approves it, the photo is deleted, approved samples feed statistics and template drafts.
 */
defineProps<{ embedded?: boolean }>()
type Item = { role: string; engineRole: string; category: string; primaryColor: string; secondaryColors: string[]; patterns: string[]; fit: string; length: string; wear: string; visibility: string; confidence: string; description: string }
type Result = {
  usable: boolean; rejectReason: string; presentation: string; seasons: string[]; occasions: string[]; styles: string[]; items: Item[]
  pose: { stance: string; bodyAngle: string; gaze: string; hands: string; description: string; tendency: string }
  framing: { shot: string; cameraAngle: string; mirrorSelfie: boolean }; scene: { setting: string; description: string }
  hair: { length: string; description: string }; expression: string; highlights: string
}
type Sample = {
  id: string; status: 'PENDING' | 'EXTRACTED' | 'FAILED' | 'APPROVED' | 'REJECTED'; sourceUrl: string | null; license: string; note: string | null; hasImage: boolean
  model: string | null; extraction: Result | null; reviewed: Result | null; error: string | null; rejectReason: string | null; presentation: string | null
  createdBy: string; createdAtMs: number; reviewedBy: string | null; templateId: string | null
}
type Count = Record<string, number>
type Stats = {
  approved: number; byStatus: Count; presentation: Count; roles: Count; bodies: { key: string; count: number }[]; colorPairs: { key: string; count: number }[]
  styles: { key: string; count: number }[]; seasons: Count; occasions: Count; stance: Count; bodyAngle: Count; gaze: Count; shot: Count; setting: Count; hair: Count; expression: Count
  unknownItems: { category: string; role: string; description: string; count: number }[]; roleMismatches: number
}
const { message, modal } = App.useApp()
const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '提取中', color: 'processing' }, EXTRACTED: { label: '待审核', color: 'gold' }, FAILED: { label: '提取失败', color: 'red' },
  APPROVED: { label: '已通过', color: 'green' }, REJECTED: { label: '已拒绝', color: 'default' },
}
const LICENSE: Record<string, string> = { OWN: '自己拍摄/本人授权', PERMITTED: '已获使用许可', OPEN: '开放许可（CC 等）', RESEARCH: '仅研究用途', UNKNOWN: '未知（只参与统计）' }
const REJECT: Record<string, string> = { NONE: '可用', MULTIPLE_PEOPLE: '多人', NOT_FULL_OUTFIT: '看不到整套', COLLAGE: '拼图', MINOR_LIKELY: '疑似未成年（已删除）', NOT_PHOTO: '不是照片', HEAVY_EDIT: '重度修图', OTHER: '其他原因' }
const PRESENTATION: Record<string, string> = { FEMININE: '女性化', MASCULINE: '男性化', NEUTRAL: '中性', UNKNOWN: '未知' }
const WORDS: Record<string, string> = {
  STANDING: '站立', WALKING: '行走', SITTING: '坐', SQUATTING: '蹲', LEANING: '倚靠', FRONT: '正面', THREE_QUARTER: '微侧', SIDE: '侧面', BACK: '背面',
  CAMERA: '看镜头', AWAY: '看别处', DOWN: '低头', UP: '抬头', HIDDEN: '看不到', FULL_BODY: '全身', HALF_BODY: '半身', CLOSE_UP: '特写', EYE_LEVEL: '平视', HIGH: '俯拍', LOW: '仰拍',
  STREET: '街头', INDOOR: '室内', STUDIO: '影棚', NATURE: '自然', CAFE: '咖啡店', CAMPUS: '校园', MALL: '商场', HOME: '家中', BEACH: '海边',
  SHORT: '短发', MEDIUM: '中长发', LONG: '长发', TIED: '扎发', COVERED: '被遮住', SMILE: '微笑', NEUTRAL: '平静', COOL: '酷', PLAYFUL: '俏皮',
  TUCKED: '塞进', HALF_TUCKED: '半塞', UNTUCKED: '不塞', OPEN: '敞开', CLOSED: '扣上', NA: '—', FULL: '完整', PARTIAL: '部分', OTHER: '其他', UNKNOWN: '未知',
}
const word = (w: string) => WORDS[w] || w
const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

const items = ref<Sample[]>([]); const loading = ref(true); const error = ref(''); const busy = ref('')
const tab = ref<'samples' | 'stats'>('samples'); const filter = ref<'ALL' | 'EXTRACTED' | 'FAILED' | 'APPROVED' | 'REJECTED'>('EXTRACTED')
const file = ref<File | null>(null); const sourceUrl = ref(''); const license = ref('OWN'); const note = ref('')
const current = ref<Sample | null>(null); const draft = ref<Result | null>(null); const dirty = ref(false); const draftKind = ref<'CLASSIC' | 'TREND'>('CLASSIC')
const stats = ref<Stats | null>(null); const statsPresentation = ref('')
const shown = computed(() => items.value.filter(i => filter.value === 'ALL' || i.status === filter.value))
const result = (s: Sample) => s.reviewed || s.extraction

async function load() {
  loading.value = true; error.value = ''
  try { items.value = (await request<{ items: Sample[] }>('/api/admin/ootd-samples')).items }
  catch (e) { error.value = e instanceof Error ? e.message : '样本列表暂时无法加载。' }
  finally { loading.value = false }
}
async function loadStats() {
  try { stats.value = await request<Stats>('/api/admin/ootd-samples/stats' + (statsPresentation.value ? `?presentation=${statsPresentation.value}` : '')) }
  catch (e) { message.error(e instanceof Error ? e.message : '统计暂时无法加载。') }
}
onMounted(load)

function pick(f: File) {
  if (!/^image\/(jpeg|png)$/.test(f.type)) { message.error('请选择 JPEG 或 PNG 图片。'); return false }
  if (f.size > 10 * 1024 * 1024) { message.error('图片不能超过 10 MB。'); return false }
  file.value = f; return false
}
async function upload() {
  if (!file.value) return
  busy.value = 'upload'
  const form = new FormData(); form.append('image', file.value); form.append('license', license.value)
  if (sourceUrl.value.trim()) form.append('sourceUrl', sourceUrl.value.trim()); if (note.value.trim()) form.append('note', note.value.trim())
  try {
    const s = await request<Sample>('/api/admin/ootd-samples', { method: 'POST', body: form })
    items.value = [s, ...items.value]; file.value = null; sourceUrl.value = ''; note.value = ''
    if (s.status === 'REJECTED') message.warning(`已自动拒收：${REJECT[s.rejectReason || 'OTHER'] || s.rejectReason}，原图已删除。`)
    else if (s.status === 'FAILED') message.error(s.error || '提取失败，原图已保留，可重新提取。')
    else { message.success('提取完成，请核对。'); open(s) }
    playSound(s.status === 'EXTRACTED' ? 'success' : 'error')
  } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '上传失败。') }
  finally { busy.value = '' }
}

function open(s: Sample) {
  current.value = s; draft.value = result(s) ? JSON.parse(JSON.stringify(result(s))) as Result : null; dirty.value = false
}
function replace(s: Sample) { items.value = items.value.map(i => i.id === s.id ? s : i); if (current.value?.id === s.id) open(s) }
async function call(label: string, path: string, init: RequestInit, done?: string) {
  if (!current.value) return
  busy.value = label
  try {
    const s = await request<Sample>(path, init); replace(s); if (done) message.success(done); playSound('tap')
  } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '操作失败。') }
  finally { busy.value = '' }
}
const base = () => `/api/admin/ootd-samples/${current.value!.id}`
async function save() { await call('save', base(), { method: 'PUT', body: JSON.stringify(draft.value) }, '已保存修改。') }
async function review(decision: 'APPROVED' | 'REJECTED') {
  if (dirty.value) await save()
  await call(decision, base() + '/review', { method: 'POST', body: JSON.stringify({ decision }) }, decision === 'APPROVED' ? '已通过，原图已删除。' : '已拒绝，原图已删除。')
}
async function retry() { await call('extract', base() + '/extract', { method: 'POST' }) }
async function makeDraft() {
  if (!current.value) return
  busy.value = 'draft'
  try {
    const r = await request<{ templateId: string }>(base() + '/template-draft', { method: 'POST', body: JSON.stringify({ kind: draftKind.value }) })
    message.success(`已生成模板草稿 ${r.templateId}，请到“搭配模板审核”通过。`); replace(await request<Sample>(base()))
  } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '生成失败。') }
  finally { busy.value = '' }
}
function remove() {
  if (!current.value) return
  const id = current.value.id
  modal.confirm({ title: '删除这个样本？', content: '结构化结果和原图（如果还在）都会删除，不能恢复。', okType: 'danger', okText: '删除', cancelText: '取消', onOk: async () => {
    await request(`/api/admin/ootd-samples/${id}`, { method: 'DELETE' }); items.value = items.value.filter(i => i.id !== id); current.value = null
  } })
}
function addItem() { draft.value?.items.push({ role: 'OTHER', engineRole: 'OTHER', category: '', primaryColor: '', secondaryColors: [], patterns: [], fit: '', length: '', wear: 'NA', visibility: 'FULL', confidence: 'HIGH', description: '' }); dirty.value = true }
function removeItem(i: number) { draft.value?.items.splice(i, 1); dirty.value = true }
const editable = computed(() => current.value?.status === 'EXTRACTED')
const top = (c: Count) => Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${word(k)} ${v}`).join(' · ') || '—'
const columns = [
  { title: '状态', key: 'status', width: 100 }, { title: '时间', key: 'time', width: 150 }, { title: '物品', key: 'items' }, { title: '来源与许可', key: 'source', width: 220 }, { title: '', key: 'actions', width: 80 },
]
</script>
<template>
  <header v-if="!embedded" class="page-heading"><div><h1>整套穿搭样本</h1><p>上传整套穿搭照片，模型提取物品、姿势与场景，审核后用于统计和生成搭配模板。原图审核完成即删除。</p></div></header>
  <div class="settings-section-content ootd-samples">
    <a-alert type="info" show-icon message="收图前请看采集规范：一张图一个人一整套、日常可穿、不收未成年人；每张图调用一次识图模型。">
      <template #description>规范见文档 docs/OOTD_SAMPLE_COLLECTION.md。许可“未知”的样本只参与统计，不能生成模板。</template>
    </a-alert>
    <section class="ootd-upload" aria-label="上传样本">
      <a-upload :before-upload="pick" :show-upload-list="false" accept="image/jpeg,image/png"><a-button>{{ file ? file.name : '选择照片' }}</a-button></a-upload>
      <a-input v-model:value="sourceUrl" placeholder="来源链接（可选）" allow-clear class="ootd-upload-url" />
      <a-select v-model:value="license" :options="Object.entries(LICENSE).map(([value, label]) => ({ value, label }))" class="ootd-upload-license" aria-label="许可" />
      <a-input v-model:value="note" placeholder="备注（可选）" allow-clear class="ootd-upload-note" />
      <a-button type="primary" :disabled="!file" :loading="busy === 'upload'" @click="upload">上传并提取</a-button>
    </section>
    <a-segmented v-model:value="tab" :options="[{ value: 'samples', label: '样本' }, { value: 'stats', label: '统计' }]" aria-label="视图" @change="(k: string | number) => k === 'stats' && loadStats()" />
    <section v-if="tab === 'samples'" class="ootd-pane" aria-label="样本列表">
        <a-alert v-if="error" type="error" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
        <a-segmented v-model:value="filter" :options="[{ value: 'EXTRACTED', label: '待审核' }, { value: 'FAILED', label: '失败' }, { value: 'APPROVED', label: '已通过' }, { value: 'REJECTED', label: '已拒绝' }, { value: 'ALL', label: '全部' }]" />
        <a-table :data-source="shown" :columns="columns" row-key="id" size="small" :loading="loading" :pagination="{ pageSize: 20 }" :scroll="{ x: 720 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'"><a-tag :color="STATUS[record.status]?.color">{{ STATUS[record.status]?.label || record.status }}</a-tag></template>
            <template v-else-if="column.key === 'time'">{{ new Date(record.createdAtMs).toLocaleString() }}</template>
            <template v-else-if="column.key === 'items'">
              <span v-if="result(record)">{{ result(record)!.items.map(i => i.category || ROLE_LABELS[i.role]).join('、') || '—' }}</span>
              <span v-else-if="record.rejectReason" class="muted">{{ REJECT[record.rejectReason] || record.rejectReason }}</span>
              <span v-else class="muted">{{ record.error || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'source'">
              <a v-if="record.sourceUrl" :href="record.sourceUrl" target="_blank" rel="noopener noreferrer">来源</a><span v-else class="muted">无链接</span>
              · {{ LICENSE[record.license] || record.license }}<template v-if="record.templateId"> · 已生成模板</template>
            </template>
            <template v-else-if="column.key === 'actions'"><a-button size="small" @click="open(record)">查看</a-button></template>
          </template>
        </a-table>
    </section>
    <section v-else class="ootd-pane" aria-label="样本统计">
        <div class="ootd-stats-toolbar">
          <a-segmented v-model:value="statsPresentation" :options="[{ value: '', label: '全部' }, { value: 'FEMININE', label: '女性化' }, { value: 'MASCULINE', label: '男性化' }, { value: 'NEUTRAL', label: '中性' }]" @change="loadStats" />
          <a-button size="small" @click="loadStats">刷新</a-button>
        </div>
        <a-empty v-if="stats && !stats.approved" description="还没有已通过的样本。" />
        <a-descriptions v-else-if="stats" bordered size="small" :column="1">
          <a-descriptions-item label="已通过样本">{{ stats.approved }}（全部状态：{{ Object.entries(stats.byStatus).map(([k, v]) => `${STATUS[k]?.label || k} ${v}`).join(' · ') }}）</a-descriptions-item>
          <a-descriptions-item label="穿搭呈现">{{ Object.entries(stats.presentation).map(([k, v]) => `${PRESENTATION[k] || k} ${v}`).join(' · ') || '—' }}</a-descriptions-item>
          <a-descriptions-item label="各位置出现（样本数）">{{ Object.entries(stats.roles).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ROLE_LABELS[k] || k} ${v}`).join(' · ') }}</a-descriptions-item>
          <a-descriptions-item label="主体组合 Top">{{ stats.bodies.map(b => `${b.key}（${b.count}）`).join('；') || '—' }}</a-descriptions-item>
          <a-descriptions-item label="上下配色 Top">{{ stats.colorPairs.map(b => `${b.key}（${b.count}）`).join('；') || '—' }}</a-descriptions-item>
          <a-descriptions-item label="风格">{{ stats.styles.map(b => `${b.key} ${b.count}`).join(' · ') || '—' }}</a-descriptions-item>
          <a-descriptions-item label="季节 / 场合">{{ top(stats.seasons) }}；{{ top(stats.occasions) }}</a-descriptions-item>
          <a-descriptions-item label="姿态 / 朝向 / 视线">{{ top(stats.stance) }}；{{ top(stats.bodyAngle) }}；{{ top(stats.gaze) }}</a-descriptions-item>
          <a-descriptions-item label="景别 / 场景">{{ top(stats.shot) }}；{{ top(stats.setting) }}</a-descriptions-item>
          <a-descriptions-item label="发型 / 表情">{{ top(stats.hair) }}；{{ top(stats.expression) }}</a-descriptions-item>
          <a-descriptions-item label="引擎还认不出的物品（词表候选）">
            <span v-if="!stats.unknownItems.length">—</span>
            <ul v-else class="ootd-unknown"><li v-for="u in stats.unknownItems" :key="u.category">{{ u.category }}（{{ u.count }}）<small v-if="u.description" class="muted"> {{ u.description }}</small></li></ul>
          </a-descriptions-item>
          <a-descriptions-item label="位置与引擎判断不一致">{{ stats.roleMismatches }} 件（多的话说明分类规则需要补词）</a-descriptions-item>
        </a-descriptions>
    </section>

    <a-drawer :open="!!current" width="min(920px, 100vw)" :title="current ? `样本 ${current.id.slice(0, 8)} · ${STATUS[current.status]?.label}` : ''" @close="current = null">
      <template v-if="current">
        <div class="ootd-detail">
          <div class="ootd-photo">
            <img v-if="current.hasImage" :src="apiUrl(`/api/admin/ootd-samples/${current.id}/image`)" alt="样本原图（审核后删除）" />
            <a-empty v-else description="原图已删除" />
            <p class="muted">{{ LICENSE[current.license] }}<template v-if="current.sourceUrl"> · <a :href="current.sourceUrl" target="_blank" rel="noopener noreferrer">来源</a></template><template v-if="current.note"> · {{ current.note }}</template></p>
            <p v-if="current.model" class="muted">提取模型：{{ current.model }}</p>
          </div>
          <div class="ootd-result">
            <a-alert v-if="current.status === 'FAILED'" type="error" show-icon :message="current.error || '提取失败'" />
            <a-alert v-if="current.status === 'REJECTED' && !draft" type="warning" show-icon :message="`已拒收：${REJECT[current.rejectReason || 'OTHER'] || current.rejectReason}`" />
            <template v-if="draft">
              <div class="ootd-row">
                <a-switch v-model:checked="draft.usable" :disabled="!editable" @change="dirty = true" /> 可用
                <a-select v-model:value="draft.rejectReason" :disabled="!editable" :options="Object.entries(REJECT).map(([value, label]) => ({ value, label }))" class="ootd-select" @change="dirty = true" />
                <a-select v-model:value="draft.presentation" :disabled="!editable" :options="Object.entries(PRESENTATION).map(([value, label]) => ({ value, label: '呈现：' + label }))" class="ootd-select" @change="dirty = true" />
              </div>
              <p class="muted">季节 {{ draft.seasons.join('/') || '—' }} · 场合 {{ draft.occasions.join('/') || '—' }} · 风格 {{ draft.styles.join('/') || '—' }}</p>
              <h4>物品（{{ draft.items.length }}）</h4>
              <div v-for="(item, i) in draft.items" :key="i" class="ootd-item">
                <a-select v-model:value="item.role" :disabled="!editable" :options="roleOptions" class="ootd-role" @change="dirty = true" />
                <a-input v-model:value="item.category" :disabled="!editable" placeholder="品类" class="ootd-cat" @change="dirty = true" />
                <a-input v-model:value="item.primaryColor" :disabled="!editable" placeholder="主色" class="ootd-color" @change="dirty = true" />
                <a-tag v-if="item.visibility === 'PARTIAL'">部分可见</a-tag>
                <a-tag v-if="item.confidence === 'LOW'" color="orange">把握低</a-tag>
                <a-tag v-if="item.wear !== 'NA'">{{ word(item.wear) }}</a-tag>
                <a-tooltip v-if="item.engineRole !== item.role && !(item.role === 'INNER' && item.engineRole === 'TOP')" :title="`推荐引擎按品类名会读成「${ROLE_LABELS[item.engineRole] || item.engineRole}」`"><a-tag color="red">分类不一致</a-tag></a-tooltip>
                <a-button v-if="editable" size="small" type="text" danger aria-label="删除这一项" @click="removeItem(i)">删除</a-button>
                <small v-if="item.description" class="muted ootd-desc">{{ item.description }}</small>
              </div>
              <a-button v-if="editable" size="small" @click="addItem">添加一项（模型漏掉的）</a-button>
              <h4>呈现（本期只采集）</h4>
              <p>姿势：{{ word(draft.pose.stance) }}、{{ word(draft.pose.bodyAngle) }}、{{ word(draft.pose.gaze) }}<template v-if="draft.pose.hands">；{{ draft.pose.hands }}</template><template v-if="draft.pose.description">；{{ draft.pose.description }}</template>（常见于{{ PRESENTATION[draft.pose.tendency] }}）</p>
              <p>构图：{{ word(draft.framing.shot) }}、{{ word(draft.framing.cameraAngle) }}{{ draft.framing.mirrorSelfie ? '、对镜自拍' : '' }} · 场景：{{ word(draft.scene.setting) }} {{ draft.scene.description }}</p>
              <p>发型：{{ word(draft.hair.length) }} {{ draft.hair.description }} · 表情：{{ word(draft.expression) }}</p>
              <a-input v-model:value="draft.highlights" :disabled="!editable" addon-before="亮点" @change="dirty = true" />
            </template>
            <div class="ootd-actions">
              <template v-if="editable">
                <a-button :disabled="!dirty" :loading="busy === 'save'" @click="save">保存修改</a-button>
                <a-button type="primary" :loading="busy === 'APPROVED'" @click="review('APPROVED')">通过</a-button>
                <a-button danger :loading="busy === 'REJECTED'" @click="review('REJECTED')">拒绝</a-button>
              </template>
              <template v-if="current.status === 'FAILED'">
                <a-button type="primary" :loading="busy === 'extract'" @click="retry">重新提取</a-button>
                <a-button danger :loading="busy === 'REJECTED'" @click="review('REJECTED')">拒绝</a-button>
              </template>
              <template v-if="current.status === 'APPROVED' && !current.templateId">
                <a-segmented v-model:value="draftKind" :options="[{ value: 'CLASSIC', label: '经典' }, { value: 'TREND', label: '流行（6 个月）' }]" />
                <a-button type="primary" :disabled="current.license === 'UNKNOWN'" :loading="busy === 'draft'" @click="makeDraft">生成模板草稿</a-button>
              </template>
              <span v-if="current.templateId" class="muted">已生成模板 {{ current.templateId }}（到“搭配模板审核”通过后生效）</span>
              <a-button type="text" danger @click="remove">删除样本</a-button>
            </div>
          </div>
        </div>
      </template>
    </a-drawer>
  </div>
</template>
<style scoped>
/* minmax(0, 1fr): the table's scroll width must not widen the page on phones. */
.ootd-samples { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.ootd-pane { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.ootd-upload { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ootd-upload-url { flex: 1 1 220px; }
.ootd-upload-license { width: 190px; }
.ootd-upload-note { flex: 1 1 160px; }
.ootd-stats-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.ootd-detail { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 16px; }
.ootd-photo img { width: 100%; border-radius: 8px; background: var(--surface-muted, #f4f4f4); }
.ootd-result { display: grid; gap: 8px; align-content: start; }
.ootd-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ootd-select { min-width: 150px; }
.ootd-item { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, .06)); }
.ootd-role { width: 140px; }
.ootd-cat { width: 150px; }
.ootd-color { width: 90px; }
.ootd-desc { flex-basis: 100%; }
.ootd-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
.ootd-unknown { margin: 0; padding-left: 18px; }
@media (max-width: 720px) { .ootd-detail { grid-template-columns: 1fr; } }
</style>
