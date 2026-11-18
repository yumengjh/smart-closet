<script setup lang="ts">
// 回收站（server#274，docs/design/2026-11-18-回收站：自动彻底删除设计.md）：恢复、彻底删除单件 / 勾选的几件 / 全部；
// 移入满保留期（默认 30 天）后服务端自动彻底删除。彻底删除不可恢复，一律先弹确认。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { App as AntApp } from 'ant-design-vue'
import { ArrowLeftOutlined, CheckSquareOutlined, CloseOutlined, DeleteOutlined, MoreOutlined, RollbackOutlined } from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import { closetApi, type TrashEntry } from '../services/api'
import { useClosetStore } from '../stores/closet'
import GarmentCard from '../components/GarmentCard.vue'
import GarmentCardSkeleton from '../components/GarmentCardSkeleton.vue'
import PageTitle from '../shell/PageTitle.vue'

const DAY = 86_400_000
const router = useRouter()
const closet = useClosetStore()
const { modal, message } = AntApp.useApp()
const items = ref<TrashEntry[]>([])
const total = ref(0), retentionDays = ref(30), autoPurge = ref(true)
const loading = ref(true), busy = ref(''), error = ref('')
const selecting = ref(false), selected = ref(new Set<string>()), batchBusy = ref<'' | 'restore' | 'purge'>(''), batchProgress = ref({ done: 0, total: 0 })
const now = ref(Date.now())

// 批量时底部悬浮条接替导航胶囊（与整理中页一致）。
watch(selecting, on => document.documentElement.classList.toggle('closet-selecting', on))
onUnmounted(() => document.documentElement.classList.remove('closet-selecting'))

const hint = computed(() => autoPurge.value ? `衣物在这里保留 ${retentionDays.value} 天，之后自动彻底删除，图片和资料都不能再找回。` : '恢复后回到删除前的位置；彻底删除后不能再找回。')
const allSelected = computed(() => items.value.length > 0 && items.value.every(item => selected.value.has(item.garment.id)))
function daysLeft(entry: TrashEntry) { return Math.max(0, Math.ceil((entry.purgeAtMs - now.value) / DAY)) }
function countdown(entry: TrashEntry) { const days = daysLeft(entry); return days <= 1 ? '即将删除' : `还剩 ${days} 天` }
function title(entry: TrashEntry) {
  const g = entry.garment
  return g.name || (g.category[0] && g.category[0] !== '未分类' ? `${g.primaryColor[0] === '未知颜色' ? '' : g.primaryColor[0] || ''}${g.category[0]}` : '未分类衣物')
}
function fail(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback }

async function load() {
  try {
    const page = await closetApi.trashPage()
    items.value = page.items; total.value = page.total; retentionDays.value = page.retentionDays; autoPurge.value = page.autoPurge
    now.value = Date.now(); error.value = ''
    const present = new Set(page.items.map(item => item.garment.id))
    selected.value = new Set([...selected.value].filter(id => present.has(id)))
  } catch (cause) { error.value = fail(cause, '回收站暂时无法加载。') }
  finally { loading.value = false }
}

function toggle(id: string) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next }
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(items.value.map(item => item.garment.id)) }
function exitSelecting() { selecting.value = false; selected.value = new Set() }

async function restore(entry: TrashEntry) {
  busy.value = entry.garment.id; error.value = ''
  try { await closetApi.restore(entry.garment.id, 'ACTIVE', entry.garment.revision); message.success(`已恢复「${title(entry)}」`); await load(); await closet.refreshCounts() }
  catch (cause) { error.value = fail(cause, '恢复失败。') }
  finally { busy.value = '' }
}

function purgeSummary(purged: number, busyCount: number) {
  if (busyCount) message.warning(`已彻底删除 ${purged} 件；${busyCount} 件还有图片在处理，稍后会自动删除。`)
  else if (purged) message.success(`已彻底删除 ${purged} 件`)
}
function confirmPurge(entry: TrashEntry) {
  modal.confirm({
    title: `彻底删除「${title(entry)}」？`, content: '图片和资料会一起删除，不能再找回。用到它的搭配会去掉这件，其余单品保留。',
    okText: '彻底删除', cancelText: '取消', okButtonProps: { danger: true },
    onOk: async () => {
      busy.value = entry.garment.id; error.value = ''
      try { const outcome = await closetApi.purge({ ids: [entry.garment.id] }); purgeSummary(outcome.purged, outcome.busy); await load() }
      catch (cause) { error.value = fail(cause, '彻底删除失败。') }
      finally { busy.value = '' }
    },
  })
}
function confirmClear() {
  modal.confirm({
    title: `清空回收站（${total.value} 件）？`, content: '回收站里的衣物会全部彻底删除，图片和资料不能再找回。用到它们的搭配会去掉这些单品。',
    okText: '全部删除', cancelText: '取消', okButtonProps: { danger: true },
    onOk: async () => {
      busy.value = 'all'; error.value = ''
      try {
        let purged = 0, busyCount = 0
        // 服务端一次至多删 200 件；还有剩的就再来一轮，直到删不动（剩下的都在处理中）。
        for (;;) {
          const outcome = await closetApi.purge({ all: true })
          purged += outcome.purged; busyCount = outcome.busy
          if (!outcome.purged) break
        }
        exitSelecting(); purgeSummary(purged, busyCount); await load()
      } catch (cause) { error.value = fail(cause, '清空失败。'); await load() }
      finally { busy.value = '' }
    },
  })
}

function startBatch(mode: 'restore' | 'purge') {
  const targets = items.value.filter(item => selected.value.has(item.garment.id))
  if (!targets.length) return
  if (mode === 'restore') { void runRestore(targets); return }
  modal.confirm({
    title: `彻底删除 ${targets.length} 件？`, content: '图片和资料会一起删除，不能再找回。用到它们的搭配会去掉这些单品。',
    okText: '彻底删除', cancelText: '取消', okButtonProps: { danger: true },
    onOk: async () => {
      batchBusy.value = 'purge'; error.value = ''
      try { const outcome = await closetApi.purge({ ids: targets.map(item => item.garment.id) }); exitSelecting(); purgeSummary(outcome.purged, outcome.busy) }
      catch (cause) { error.value = fail(cause, '彻底删除失败。') }
      finally { batchBusy.value = ''; await load() }
    },
  })
}
async function runRestore(targets: TrashEntry[]) {
  batchBusy.value = 'restore'; error.value = ''; batchProgress.value = { done: 0, total: targets.length }
  const failures: string[] = []; let done = 0
  for (const [index, entry] of targets.entries()) {
    try { await closetApi.restore(entry.garment.id, 'ACTIVE', entry.garment.revision); done++ }
    catch (cause) { failures.push(`${title(entry)}：${fail(cause, '恢复失败')}`) }
    finally { batchProgress.value = { done: index + 1, total: targets.length } }
  }
  batchBusy.value = ''
  if (failures.length) error.value = `恢复了 ${done} 件，${failures.length} 件没成功：${failures.join('；')}`
  else message.success(`已恢复 ${done} 件`)
  if (done) { exitSelecting(); await load(); await closet.refreshCounts() }
}

onMounted(load)
</script>

<template>
  <PageTitle title="回收站" :count="loading ? null : total" unit="件" :hint="hint" />
  <div class="list-toolbar trash-toolbar">
    <a-button class="trash-back" @click="router.push('/settings')"><ArrowLeftOutlined /> 我的</a-button>
    <span class="trash-gap"></span>
    <template v-if="items.length && !selecting">
      <a-button @click="selecting = true"><CheckSquareOutlined /> 批量处理</a-button>
      <a-button danger :loading="busy === 'all'" @click="confirmClear"><DeleteOutlined /> 清空</a-button>
    </template>
  </div>
  <p v-if="autoPurge && items.length && !selecting" class="trash-note">保留 {{ retentionDays }} 天，到期自动彻底删除。</p>
  <p v-if="selecting" class="trash-note">点衣服勾选；选好后在下方恢复或彻底删除。</p>
  <Teleport to="body">
    <Transition name="batch-float">
      <section v-if="selecting" class="batch-float" aria-label="批量处理">
        <div class="batch-float-count"><b>{{ selected.size }}</b><span>件已选<small v-if="batchBusy === 'restore'">正在恢复 {{ batchProgress.done }} / {{ batchProgress.total }}</small></span></div>
        <div class="batch-float-pick"><a-checkbox :checked="allSelected" :indeterminate="selected.size > 0 && !allSelected" :disabled="Boolean(batchBusy)" @change="toggleAll">全选</a-checkbox></div>
        <div class="batch-float-actions">
          <a-button type="primary" :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'restore'" @click="startBatch('restore')"><RollbackOutlined /> 恢复</a-button>
          <a-button danger :disabled="!selected.size || Boolean(batchBusy)" :loading="batchBusy === 'purge'" @click="startBatch('purge')">彻底删除</a-button>
        </div>
        <a-tooltip title="退出批量处理"><a-button class="batch-float-close" type="text" shape="circle" aria-label="退出批量处理" :disabled="Boolean(batchBusy)" @click="exitSelecting"><CloseOutlined /></a-button></a-tooltip>
      </section>
    </Transition>
  </Teleport>
  <a-alert v-if="error" type="error" :message="error" show-icon closable class="page-alert" @close="error = ''" />
  <GarmentCardSkeleton v-if="loading" label="正在加载回收站…" />
  <section v-else-if="items.length" class="garment-grid">
    <div v-for="entry in items" :key="entry.garment.id" class="trash-card">
      <GarmentCard :garment="entry.garment" trashed :selectable="selecting" :selected="selected.has(entry.garment.id)" @toggle="toggle(entry.garment.id)" />
      <div class="trash-card-foot">
        <span v-if="autoPurge" class="trash-countdown" :class="{ soon: daysLeft(entry) <= 3 }">{{ countdown(entry) }}</span>
        <span class="trash-gap"></span>
        <template v-if="!selecting">
          <a-button size="small" :loading="busy === entry.garment.id" :disabled="Boolean(busy) && busy !== entry.garment.id" @click="restore(entry)"><RollbackOutlined /> 恢复</a-button>
          <a-dropdown :trigger="['click']" placement="bottomRight">
            <a-button size="small" type="text" :aria-label="`更多操作：${title(entry)}`" :disabled="Boolean(busy)"><MoreOutlined /></a-button>
            <template #overlay><a-menu><a-menu-item key="purge" danger @click="confirmPurge(entry)"><DeleteOutlined /> 彻底删除</a-menu-item></a-menu></template>
          </a-dropdown>
        </template>
      </div>
    </div>
  </section>
  <section v-else-if="!error" class="empty-wardrobe compact-empty"><span class="empty-spark"><RollbackOutlined /></span><h2>回收站是空的</h2><p>移出衣柜的衣物会在这里保留 {{ retentionDays }} 天。</p></section>
  <p v-if="total > items.length" class="trash-more">还有 {{ total - items.length }} 件，删除或恢复上面的之后显示。</p>
</template>

<style scoped>
.trash-toolbar { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.trash-back.ant-btn { padding-inline: 10px 14px; color: var(--muted-strong); background: var(--surface-alt); border-color: transparent; box-shadow: none; }
.trash-back.ant-btn:hover, .trash-back.ant-btn:focus-visible { color: var(--ink); background: var(--surface-alt); border-color: var(--line); }
.trash-gap { flex: 1; }
.trash-note { margin: 0 0 18px; font-size: 13px; color: var(--muted); }
.trash-card { display: grid; align-content: start; }
.trash-card :deep(.card-copy) { padding-bottom: 0; }
.trash-card-foot { display: flex; align-items: center; gap: 4px; min-height: 32px; padding: 4px 2px 0 6px; }
.trash-countdown { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.trash-countdown.soon { color: var(--warning); }
.trash-more { margin: 20px 0 0; font-size: 13px; color: var(--muted); text-align: center; }
</style>
