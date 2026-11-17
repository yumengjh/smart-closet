<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, EllipsisOutlined, PictureOutlined } from '@ant-design/icons-vue'
import { creationApi } from '../creation/api'
import { creationCatalog, loadCreationCatalog } from '../creation/access'
import { liveCreation } from '../creation/model'
import { workState } from '../creation/steps'
import { refreshWorks, watchWorks, workJobs, workPage, worksError, worksLoaded, workTotal } from '../creation/works'
import type { CreationJob } from '../creation/types'
import { mediaUrl } from '../services/urls'
import AiBadge from '../components/AiBadge.vue'
import CreationViewer from '../components/creation/CreationViewer.vue'

const router = useRouter(), { message, modal } = App.useApp()
const opened = ref<CreationJob | null>(null)
const enabled = computed(() => Boolean(creationCatalog.value?.enabled))
const describe = (cause: unknown) => cause instanceof Error ? cause.message : '暂时未能完成，请稍后重试。'

function open(job: CreationJob) { if (job.status === 'SUCCEEDED' && job.mediaUrl) opened.value = job }
// 再试一次沿用现有语义：带 parentJobId 回到创作页，衣服取草稿里当前的，会用 1 次。
function again(job: CreationJob) { message.info('再试一次会用 1 次'); void router.push({ path: '/creation', query: { again: job.id, template: job.templateId } }) }
function cancel(job: CreationJob) { modal.confirm({ title: '取消这次创作？', content: '已发送给图片服务的尝试仍会用掉 1 次。', okText: '取消创作', cancelText: '继续等待', async onOk() { try { await creationApi.cancel(job.id); await refreshWorks() } catch (cause) { message.error(describe(cause)) } } }) }
function remove(job: CreationJob) { modal.confirm({ title: '删除这条作品？', content: '正在创作的会先取消，删除后无法再查看。', okText: '删除', okType: 'danger', cancelText: '保留', async onOk() { try { await creationApi.remove(job.id); await refreshWorks() } catch (cause) { message.error(describe(cause)) } } }) }
const menuFor = (job: CreationJob) => [...(job.canCancel && liveCreation(job) ? [{ key: 'cancel', label: '取消创作' }] : []), { key: 'delete', label: '删除', danger: true }]
function onMenu(job: CreationJob, key: string) { if (key === 'cancel') cancel(job); else remove(job) }

let stop: (() => void) | undefined
onMounted(() => { void loadCreationCatalog(true).catch(() => { /* 作品仍可查看。 */ }); void refreshWorks(1); stop = watchWorks() })
onUnmounted(() => stop?.())
</script>

<template>
  <div class="cw-page">
    <header class="cw-head">
      <a-button type="text" shape="circle" aria-label="返回" @click="router.push('/try')"><ArrowLeftOutlined /></a-button>
      <h1>我的作品</h1>
      <a-button v-if="enabled" type="text" @click="router.push('/creation')">去创作</a-button><span v-else class="cw-gap" />
    </header>
    <a-alert v-if="worksError" type="warning" :message="worksError" show-icon class="cw-alert"><template #action><a-button size="small" @click="refreshWorks()">重试</a-button></template></a-alert>
    <a-skeleton v-if="!worksLoaded && !worksError" active :paragraph="{ rows: 6 }" />
    <div v-else-if="workJobs.length" class="cw-grid">
      <article v-for="job in workJobs" :key="job.id" class="cw-card">
        <a-button v-if="job.status === 'SUCCEEDED' && job.mediaUrl" type="text" class="cw-art" :aria-label="`查看${job.templateName}`" @click="open(job)">
          <img :src="mediaUrl(job.mediaUrl)" :alt="job.templateName" loading="lazy" /><AiBadge small />
        </a-button>
        <div v-else class="cw-art cw-state" :class="workState(job).tone">
          <a-spin v-if="liveCreation(job)" /><PictureOutlined v-else />
          <strong>{{ workState(job).label }}</strong><p>{{ workState(job).detail }}</p>
          <a-button v-if="job.status === 'FAILED' || job.status === 'UNKNOWN'" size="small" @click="again(job)">再试一次</a-button>
        </div>
        <div v-if="job.status !== 'SUCCEEDED'" class="cw-meta">
          <span>{{ job.templateName }}</span>
          <a-dropdown :trigger="['click']"><a-button type="text" size="small" shape="circle" aria-label="更多"><EllipsisOutlined /></a-button><template #overlay><a-menu :items="menuFor(job)" @click="({ key }: { key: string }) => onMenu(job, String(key))" /></template></a-dropdown>
        </div>
        <div v-else class="cw-meta"><span>{{ job.templateName }}</span></div>
      </article>
    </div>
    <a-empty v-else-if="worksLoaded" :image="null" class="cw-empty" description="第一张作品，从衣柜里的衣服开始"><a-button v-if="enabled" type="primary" size="large" @click="router.push('/creation')">去创作</a-button></a-empty>
    <a-pagination v-if="workTotal > 12" :current="workPage" :total="workTotal" :page-size="12" :show-size-changer="false" class="cw-pages" @change="refreshWorks" />
    <CreationViewer :job="opened" @close="opened = null" @changed="refreshWorks()" />
  </div>
</template>

<style scoped>
.cw-page { max-width: 960px; margin: 0 auto; padding: 0 16px 24px; }
.cw-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 52px; }
.cw-head h1 { flex: 1; margin: 0; font-size: 17px; font-weight: 600; text-align: center; }
.cw-head .ant-btn:last-child, .cw-gap { margin-right: -8px; min-width: 32px; }
.cw-alert { margin-bottom: 12px; }
.cw-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
.cw-card { min-width: 0; }
.cw-art { position: relative; display: block; width: 100%; height: auto; padding: 0; aspect-ratio: 3 / 4; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-alt); }
.cw-art img { width: 100%; height: 100%; object-fit: cover; }
.cw-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px; text-align: center; color: var(--muted-strong); }
.cw-state strong { color: var(--ink); font-size: 14px; }
.cw-state p { margin: 0; font-size: 12px; line-height: 1.5; }
.cw-state.failed strong { color: var(--danger); }
.cw-state :deep(.anticon) { font-size: 24px; }
.cw-meta { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-height: 28px; margin-top: 4px; font-size: 13px; color: var(--muted-strong); }
.cw-meta span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cw-empty { margin-top: 15vh; }
.cw-pages { margin-top: 20px; text-align: center; }
@media (min-width: 768px) { .cw-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; } }
@media (min-width: 1024px) { .cw-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
