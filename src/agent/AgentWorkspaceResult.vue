<script setup lang="ts">
import { computed } from 'vue'
import { useClosetStore } from '../stores/closet'
import { workspace } from '../domain/outfit-workspace'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
const props = defineProps<{ result: { workspaceId: string; sessionId: string; boardIds: string[]; status: string; message?: string } }>()
defineEmits<{ open: [] }>()
const closet = useClosetStore()
const boards = computed(() => closet.user ? workspace(closet.user.username, props.result.workspaceId).boards.filter(b => props.result.boardIds.includes(b.id)) : [])
</script>
<template><section class="agent-workspace-result"><div class="agent-workspace-minis"><OutfitThumbnail v-for="board in boards.slice(0, 5)" :key="board.id" :scene="board.scene" :title="board.name" /></div><strong>{{ result.status === 'COMPLETE' ? '搭配已放上临时搭台' : '搭台操作已中断' }}</strong><small>{{ result.message || (boards.length ? `${boards.length} 套本机草稿 · 满意后再保存` : '临时画板仅保留在创建它的设备') }}</small><RouterLink :to="{ path: '/outfits/workspace', query: { session: result.sessionId, ...(result.boardIds[0] ? { board: result.boardIds[0] } : {}) } }" @click="$emit('open')"><a-button block size="small">打开临时搭台 ↗</a-button></RouterLink></section></template>
<style>.agent-workspace-result{border:1px solid #e0e5dd;background:#f7f9f4;padding:12px;border-radius:12px;display:grid;gap:8px}.agent-workspace-result small{font-size:11px;color:#747770}.agent-workspace-minis{display:flex;gap:6px;overflow:hidden}.agent-workspace-minis>div{width:50px;flex-shrink:0}.agent-workspace-minis canvas{width:100%;height:auto}.assistant-operation-record{font-size:12px;margin:8px 0;color:#747770}.assistant-operation-record summary{cursor:pointer}.assistant-operation-record ol{padding-left:20px;margin:8px 0}.assistant-operation-record li{margin:5px 0;line-height:1.5}</style>
