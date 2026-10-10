<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { App } from 'ant-design-vue'
import { processingApi, poolLabels, executionLabels, type AdminProcessing, type Limits } from '../services/processing'
defineProps<{ embedded?: boolean }>()
const { message } = App.useApp()
const state = ref<AdminProcessing>(); const draft = ref<Limits>(); const error = ref(''); const saving = ref(false); const page = ref(1); let timer = 0; let alive = true; let draftRevision = 0
async function load(reset = false) { try { state.value = await processingApi.admin(page.value); if (!draft.value || reset) { draft.value = JSON.parse(JSON.stringify(state.value.resources.config.limits)); draftRevision = state.value.resources.config.revision } if (reset) error.value = '' } catch (cause) { error.value = String(cause) } }
// Issue #16: saving was silent, and a revision conflict (someone else saved first) showed a raw error.
async function save() {
  if (!draft.value || !state.value) return; saving.value = true
  try { await processingApi.config(draft.value, draftRevision); await load(true); message.success('调度配置已保存，新任务按新容量排队；正在运行的任务不受影响。') }
  catch (cause) {
    const text = cause instanceof Error ? cause.message : String(cause)
    if (/CONFIG_CONFLICT|配置已变化|conflict/i.test(text)) { await load(true); message.warning('配置刚被其他人或其他页面修改过，已重新读取最新配置，请确认后再保存。') }
    else error.value = text
  } finally { saving.value = false }
}
async function reload() { await load(true); message.info('已重新读取配置，未保存的修改已放弃。') }
async function poll() { await load(); if (alive) timer = window.setTimeout(poll, 3000) }
onMounted(poll); onBeforeUnmount(() => { alive = false; clearTimeout(timer) })
</script>
<template>
  <header v-if="!embedded" class="page-heading"><div><h1>任务与资源管理</h1><p>查看全局积压与账户瓶颈。降低容量不会中止正在运行的任务。</p></div></header>
  <div class="settings-section-content processing-admin">
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <section v-if="!state || !draft" class="settings-group"><a-skeleton active /></section>
    <template v-else>
      <section class="settings-group">
        <header class="settings-group-head"><h3>正在运行</h3><p>降低容量不会中止正在运行的任务。</p></header>
        <div class="admin-stats">
          <div v-for="pool in ['CPU','RECOGNITION','GENERATION']" :key="pool"><span>{{ poolLabels[pool] }}</span><strong>{{ state.resources.running[pool] || 0 }}</strong></div>
        </div>
      </section>

      <section class="settings-group">
        <header class="settings-group-head"><h3>调度配置</h3><p>各资源池容量与上游账户并发。</p></header>
        <a-form :model="draft" layout="vertical" @finish="save">
          <div class="limits-grid">
            <a-form-item label="本地处理容量"><a-input-number v-model:value="draft.cpu" :min="1" :max="16" /></a-form-item>
            <a-form-item label="识别容量"><a-input-number v-model:value="draft.recognition" :min="1" :max="32" /></a-form-item>
            <a-form-item label="增强容量"><a-input-number v-model:value="draft.generation" :min="1" :max="16" /></a-form-item>
            <a-form-item label="每个上游凭据账户总并发"><a-input-number v-model:value="draft.accountConcurrency" :min="1" :max="64" /></a-form-item>
            <a-form-item label="助手预留并发"><a-input-number v-model:value="draft.assistantReserved" :min="0" :max="draft.accountConcurrency" /></a-form-item>
            <a-form-item label="每分钟请求数 RPM（未知时留空）"><a-input-number v-model:value="draft.rpm" :min="1" /></a-form-item>
          </div>
          <a-form-item label="暂停资源池"><a-checkbox-group v-model:value="draft.paused" :options="Object.entries(poolLabels).map(([value,label]) => ({ value, label }))" /></a-form-item>
          <div class="settings-group-actions">
            <a-button type="primary" html-type="submit" :loading="saving">保存调度配置</a-button>
            <a-button @click="reload">放弃修改并重新读取</a-button>
          </div>
        </a-form>
      </section>

      <div class="admin-columns">
        <section class="settings-group">
          <header class="settings-group-head"><h3>全局积压</h3></header>
          <p v-if="!state.resources.counts.length" class="muted">当前没有积压。</p>
          <ul class="admin-rows">
            <li v-for="(count,i) in state.resources.counts" :key="i"><span>{{ poolLabels[String(count.POOL || count.pool)] }} · {{ executionLabels[String(count.STATUS || count.status)] }}</span><strong>{{ count.TOTAL ?? count.total }}</strong></li>
          </ul>
        </section>
        <section class="settings-group">
          <header class="settings-group-head"><h3>账户占用</h3></header>
          <p v-if="!state.resources.accounts.length" class="muted">当前没有上游请求占用。</p>
          <ul class="admin-rows">
            <li v-for="(account,i) in state.resources.accounts" :key="i"><span>{{ account.ACCOUNT_ID || account.account_id }} · {{ account.PURPOSE || account.purpose }} · {{ account.STATUS || account.status }}</span><strong>{{ account.TOTAL ?? account.total }}</strong></li>
          </ul>
        </section>
      </div>

      <section class="settings-group">
        <header class="settings-group-head settings-group-head-row">
          <div><h3>最近任务</h3><p>每页最多 100 条，每 3 秒自动刷新。</p></div>
          <a-space>
            <a-button size="small" :disabled="page === 1" @click="page--; load()">上一页</a-button>
            <span class="muted">第 {{ page }} 页</span>
            <a-button size="small" :disabled="state.items.length < 100" @click="page++; load()">下一页</a-button>
          </a-space>
        </header>
        <div class="admin-task-list">
          <article v-for="task in state.items" :key="task.id" class="admin-task"><strong>{{ task.owner || '旧任务' }} · {{ poolLabels[task.pool] }} · {{ executionLabels[task.status] }}</strong><p>{{ task.waitReason || task.error || task.businessId }}</p></article>
        </div>
      </section>
    </template>
  </div>
</template>
<style scoped>
.admin-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.admin-stats > div { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: var(--radius-md); background: var(--surface-alt); }
.admin-stats span { font-size: 12px; color: var(--muted-copy); }
.admin-stats strong { font-size: 24px; font-weight: 500; }
.limits-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 var(--space-5); }
.limits-grid :deep(.ant-input-number) { width: 100%; }
.admin-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
.admin-rows { margin: 0; padding: 0; list-style: none; }
.admin-rows li { display: flex; justify-content: space-between; gap: var(--space-3); padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.admin-rows li:last-child { border-bottom: 0; }
.admin-rows span { min-width: 0; color: var(--muted-copy); overflow-wrap: anywhere; }
.admin-task-list { max-height: 520px; overflow-y: auto; margin: 0 calc(-1 * var(--space-3)); padding: 0 var(--space-3); overscroll-behavior: contain; }
.admin-task { padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.admin-task:last-child { border-bottom: 0; }
.admin-task p { margin-top: 4px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
@media (max-width: 767px) {
  .admin-stats { gap: var(--space-2); }
  .admin-stats > div { padding: 10px 12px; }
  .admin-stats strong { font-size: 20px; }
  .admin-columns { grid-template-columns: 1fr; gap: var(--space-3); }
  .limits-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 var(--space-3); }
  .admin-task-list { max-height: 420px; }
}
</style>
