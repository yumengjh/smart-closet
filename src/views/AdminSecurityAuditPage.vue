<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DatePicker } from 'ant-design-vue'
import { App } from 'ant-design-vue'
import { closetApi, type SecurityAuditCatalog, type SecurityAuditIntegrity, type SecurityAuditPage } from '../services/api'
import { accountTime } from '../domain/account'
import { auditCategoryColors, auditCategoryLabels, auditResultColor, auditResultLabel, auditSubjectLabel, auditTypeLabel, auditTypeOptions, integritySummary, integrityProblemLabels } from '../domain/securityAudit'

const ARangePicker = DatePicker.RangePicker
const { message } = App.useApp()
defineProps<{ embedded?: boolean }>()
const busy = ref(false); const error = ref('')
const range = ref<[string, string]>()
const filters = reactive<{ category?: string; type?: string; username: string }>({ category: undefined, type: undefined, username: '' })
const paging = reactive({ page: 1, size: 20 })
const result = ref<SecurityAuditPage>({ items: [], total: 0, page: 1, size: 20 })
const catalog = ref<SecurityAuditCatalog>()
let serial = 0
const exporting = ref(false); const checking = ref(false); const integrity = ref<SecurityAuditIntegrity>()
const categoryOptions = Object.entries(auditCategoryLabels).map(([value, label]) => ({ value, label }))
const typeOptions = computed(() => auditTypeOptions(catalog.value?.categories, filters.category))
const columns = [
  { title: '时间', key: 'time', width: 170 }, { title: '分类', key: 'category', width: 140 }, { title: '事件', key: 'type', width: 170 },
  { title: '对象', key: 'subject', width: 160 }, { title: '操作者', key: 'actor', width: 150 }, { title: '结果', key: 'result', width: 90 }, { title: '详情', key: 'detail', width: 360 },
]
const pagination = computed(() => ({ current: paging.page, pageSize: paging.size, total: result.value.total, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (total: number) => `共 ${total} 条` }))

async function load() {
  const current = ++serial; busy.value = true; error.value = ''
  try {
    const page = await closetApi.adminSecurityAudit({ from: range.value?.[0], to: range.value?.[1], category: filters.category, type: filters.type, username: filters.username.trim() || undefined, page: paging.page, size: paging.size })
    if (current !== serial) return
    result.value = page
    if (!page.items.length && page.total > 0 && paging.page > 1) { paging.page = Math.ceil(page.total / paging.size); await load() }
  } catch (cause) { if (current === serial) error.value = cause instanceof Error ? cause.message : '安全审计暂时无法加载。' }
  finally { if (current === serial) busy.value = false }
}
function search() { paging.page = 1; void load() }
function changeCategory() { filters.type = undefined; search() }
function reset() { range.value = undefined; Object.assign(filters, { category: undefined, type: undefined, username: '' }); search() }
function changePage(value: { current?: number; pageSize?: number }) {
  paging.page = value.pageSize && value.pageSize !== paging.size ? 1 : value.current || 1; paging.size = value.pageSize || paging.size; void load()
}
function currentFilters() { return { from: range.value?.[0], to: range.value?.[1], category: filters.category, type: filters.type, username: filters.username.trim() || undefined } }
async function exportCsv() {
  if (exporting.value) return
  exporting.value = true
  try {
    const file = await closetApi.adminSecurityAuditExport(currentFilters())
    const url = URL.createObjectURL(file.blob); const link = document.createElement('a'); link.href = url; link.download = file.filename; link.click(); URL.revokeObjectURL(url)
    if (file.truncated) message.warning('符合条件的记录超过 10000 条，只导出了最新的 10000 条；请缩小日期范围后再导出。')
    else message.success('已导出当前筛选条件下的审计记录。')
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '导出失败。') }
  finally { exporting.value = false }
}
async function checkIntegrity() {
  if (checking.value) return
  checking.value = true; integrity.value = undefined
  try { integrity.value = await closetApi.adminSecurityAuditIntegrity() }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '校验失败。') }
  finally { checking.value = false }
}
onMounted(async () => {
  void load()
  try { catalog.value = await closetApi.adminSecurityAuditCatalog() } catch { /* 类型下拉缺省时仍可按分类和用户名查询。 */ }
})
</script>

<template>
  <header v-if="!embedded" class="page-heading"><div><p class="eyebrow">管理员</p><h1>安全审计</h1><p class="page-subtitle">登录、权限、邀请码、管理员操作和模型调用的统一时间线。</p></div></header>
  <div class="settings-section-content audit-page">
    <section class="settings-group">
      <header class="settings-group-head settings-group-head-row"><div><h3>安全审计</h3><p>默认显示近 30 天，新的在前。记录保留 {{ catalog?.retentionDays ?? 180 }} 天；不含密码、邀请码、IP、浏览器信息和对话内容；每天封存一次摘要，可随时“校验完整性”。</p></div></header>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <form class="audit-filters" @submit.prevent="search">
        <a-range-picker v-model:value="range" value-format="YYYY-MM-DD" :allow-clear="true" :placeholder="['开始日期', '结束日期']" @change="search" />
        <a-select v-model:value="filters.category" :options="categoryOptions" allow-clear placeholder="全部分类" aria-label="事件分类" @change="changeCategory" />
        <a-select v-model:value="filters.type" :options="typeOptions" allow-clear show-search option-filter-prop="label" placeholder="全部类型" aria-label="事件类型" @change="search" />
        <a-input v-model:value="filters.username" :maxlength="80" allow-clear placeholder="用户名" aria-label="用户名" />
        <a-button type="primary" html-type="submit" :loading="busy">查询</a-button><a-button :disabled="busy" @click="reset">重置</a-button>
        <a-button :loading="exporting" @click="exportCsv">导出 CSV</a-button><a-button :loading="checking" @click="checkIntegrity">校验完整性</a-button>
      </form>
      <a-alert v-if="integrity" class="audit-integrity" :type="integrity.status === 'TAMPERED' ? 'error' : integrity.status === 'INTACT' ? 'success' : 'info'" show-icon closable :message="integritySummary(integrity)" @close="integrity = undefined">
        <template v-if="integrity.problems.length" #description><ul class="audit-problems"><li v-for="problem in integrity.problems" :key="problem.day + problem.kind">{{ problem.day }}：{{ integrityProblemLabels[problem.kind] || problem.kind }}</li></ul></template>
        <template v-else-if="integrity.latestDay" #description>最近封存：{{ integrity.latestDay }}，摘要 {{ integrity.latestDigest?.slice(0, 16) }}…</template>
      </a-alert>
      <p class="settings-hint">登录失败只记录用户名的单向摘要；按用户名查询时会自动匹配，输入真实用户名即可看到对应的失败尝试。</p>
      <div class="audit-table"><a-table :columns="columns" :data-source="result.items" row-key="id" :loading="busy" :pagination="pagination" :scroll="{ x: 1240 }" size="small" @change="changePage">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'time'">{{ accountTime(record.occurredAtMs) }}</template>
          <a-tag v-else-if="column.key === 'category'" :color="auditCategoryColors[record.category]">{{ auditCategoryLabels[record.category] || record.category }}</a-tag>
          <template v-else-if="column.key === 'type'"><strong>{{ auditTypeLabel(record.type) }}</strong><p class="muted">{{ record.type }}</p></template>
          <template v-else-if="column.key === 'subject'">{{ auditSubjectLabel(record.subject) }}</template>
          <template v-else-if="column.key === 'actor'">{{ auditSubjectLabel(record.actor) }}</template>
          <a-tag v-else-if="column.key === 'result' && record.result" :color="auditResultColor(record.result)">{{ auditResultLabel(record.result) }}</a-tag>
          <span v-else-if="column.key === 'detail'" class="audit-detail">{{ record.detail || '—' }}</span>
        </template>
        <template #emptyText><a-empty description="这个范围内没有审计事件" /></template>
      </a-table></div>
    </section>
  </div>
</template>

<style scoped>
.audit-page, .audit-table { min-width: 0; max-width: 100%; }
.audit-filters { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3); }
.audit-filters > .ant-select { width: 180px; }
.audit-filters > .ant-input-affix-wrapper { flex: 0 1 180px; min-width: 0; }
.audit-integrity { margin-bottom: var(--space-3); }
.audit-problems { margin: 0; padding-left: 18px; }
.audit-table { width: 100%; overflow-x: auto; }
.audit-table :deep(td) { overflow-wrap: anywhere; }
.audit-table :deep(.ant-pagination) { flex-wrap: wrap; }
.audit-table p { margin: 0; }
.audit-detail { font-size: 12px; color: var(--muted-copy); font-variant-numeric: tabular-nums; }
@media (max-width: 767px) { .audit-filters > .ant-select, .audit-filters > .ant-input-affix-wrapper { flex: 1 1 100%; width: auto; } }
</style>
