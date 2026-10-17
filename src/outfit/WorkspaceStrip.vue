<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useClosetStore } from '../stores/closet'
import { listWorkspaces, pruneAgentWorkspaces, setActiveWorkspace, workspaceSummary, type WorkspaceInfo, type WorkspaceSummary } from '../domain/workspace-registry'

/**
 * Entry to the workspaces (画板) from the outfit library. The library lists saved outfits of the account; a 画板 groups the
 * 组合台 being worked on, kept on this device, so it is shown as a way in rather than as a filter of saved outfits.
 */
const router = useRouter(), closet = useClosetStore()
const items = ref<{ info: WorkspaceInfo; summary: WorkspaceSummary }[]>([])
function load() {
  const owner = closet.user?.username; if (!owner) return
  pruneAgentWorkspaces(owner)
  items.value = listWorkspaces(owner).map(info => ({ info, summary: workspaceSummary(owner, info.id) }))
}
onMounted(load)
const visible = computed(() => items.value.length > 1 || items.value.some(item => item.summary.boards > 0))
function open(info: WorkspaceInfo) {
  const owner = closet.user?.username; if (!owner) return
  if (info.kind === 'agent') void router.push({ path: '/outfits/workspace', query: { session: info.id.slice('agent:'.length) } })
  else { setActiveWorkspace(owner, info.id); void router.push('/outfits/workspace') }
}
function label(item: { info: WorkspaceInfo; summary: WorkspaceSummary }) {
  const { boards, unsaved } = item.summary
  return `${item.info.name}${item.info.kind === 'agent' ? '（临时）' : ''} · ${boards ? `${boards} 个组合台${unsaved ? `，${unsaved} 个未保存` : ''}` : '空'}`
}
</script>

<template>
  <section v-if="visible" class="workspace-strip" aria-label="我的画板">
    <span class="workspace-strip-title">画板</span>
    <div class="workspace-strip-list">
      <a-button v-for="item in items" :key="item.info.id" size="small" shape="round" :class="{ draft: item.summary.unsaved > 0 }" @click="open(item.info)">{{ label(item) }}</a-button>
    </div>
  </section>
</template>

<style scoped>
.workspace-strip { display: flex; align-items: center; gap: 12px; margin: -6px 0 20px; }
.workspace-strip-title { flex: none; font-size: 13px; color: var(--muted-copy); }
.workspace-strip-list { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
.workspace-strip-list .ant-btn { height: 30px; padding-inline: 14px; font-size: 13px; color: var(--muted-strong); }
.workspace-strip-list .ant-btn.draft { border-color: var(--accent); }
@media (max-width: 767px) { .workspace-strip { align-items: flex-start; margin-top: 0; } .workspace-strip-title { line-height: 30px; } }
</style>
