<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AppstoreOutlined, DownOutlined } from '@ant-design/icons-vue'
import { useClosetStore } from '../stores/closet'
import { listWorkspaces, pruneAgentWorkspaces, setActiveWorkspace, workspaceSummary, type WorkspaceInfo, type WorkspaceSummary } from '../domain/workspace-registry'

/**
 * Entry to the workspaces (画板) from the outfit library. The library lists saved outfits of the account; a 画板 groups the
 * 组合台 being worked on, kept on this device, so it is a way in rather than a filter of saved outfits. One button in the
 * page heading: a plain link while there is a single empty workspace, a dropdown of workspaces once there is more to pick.
 */
const router = useRouter(), closet = useClosetStore()
const items = ref<{ info: WorkspaceInfo; summary: WorkspaceSummary }[]>([])
function load() {
  const owner = closet.user?.username; if (!owner) return
  pruneAgentWorkspaces(owner)
  items.value = listWorkspaces(owner).map(info => ({ info, summary: workspaceSummary(owner, info.id) }))
}
onMounted(load)
const listed = computed(() => items.value.length > 1 || items.value.some(item => item.summary.boards > 0))
const unsaved = computed(() => items.value.reduce((sum, item) => sum + item.summary.unsaved, 0))
function open(info: WorkspaceInfo) {
  const owner = closet.user?.username; if (!owner) return
  if (info.kind === 'agent') void router.push({ path: '/outfits/workspace', query: { session: info.id.slice('agent:'.length) } })
  else { setActiveWorkspace(owner, info.id); void router.push('/outfits/workspace') }
}
function detail(summary: WorkspaceSummary) {
  return summary.boards ? `${summary.boards} 个组合台${summary.unsaved ? `，${summary.unsaved} 个未保存` : ''}` : '空'
}
</script>

<template>
  <a-dropdown v-if="listed" :trigger="['click']" placement="bottomRight">
    <a-button class="workspace-menu-button" :aria-label="unsaved ? `工作区，${unsaved} 个未保存` : '工作区'">
      <a-badge :dot="unsaved > 0" :offset="[2, 0]"><AppstoreOutlined /></a-badge><span>工作区</span><DownOutlined class="workspace-menu-caret" />
    </a-button>
    <template #overlay>
      <a-menu class="workspace-menu">
        <a-menu-item v-for="item in items" :key="item.info.id" @click="open(item.info)">
          <span class="workspace-menu-item"><strong>{{ item.info.name }}<template v-if="item.info.kind === 'agent'">（临时）</template></strong><small :class="{ draft: item.summary.unsaved > 0 }">{{ detail(item.summary) }}</small></span>
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
  <a-button v-else class="workspace-menu-button" @click="router.push('/outfits/workspace')"><AppstoreOutlined /><span>工作区</span></a-button>
</template>

<style scoped>
.workspace-menu-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.workspace-menu-button :deep(.ant-badge) { color: inherit; }
.workspace-menu-caret { font-size: 10px; color: var(--muted-copy); }
.workspace-menu-item { display: flex; flex-direction: column; gap: 2px; min-width: 180px; padding: 2px 0; line-height: 1.4; }
.workspace-menu-item strong { font-weight: 500; }
.workspace-menu-item small { font-size: 12px; color: var(--muted-copy); }
.workspace-menu-item small.draft { color: var(--accent); }
</style>
