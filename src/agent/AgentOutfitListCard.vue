<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MoreOutlined } from '@ant-design/icons-vue'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import { closetApi } from '../services/api'
import type { OutfitScene } from '../domain/outfit'
import type { SavedOutfitItem } from './api'
import { prefillAssistant, sendToAssistant } from './assistantEvents'

/**
 * 已保存搭配卡：the assistant listed the user's saved outfits. Thumbnails come from the outfit API (one request per
 * outfit revision, shared for the page session); every action is navigation or a new chat message.
 */
const props = defineProps<{ payload: { outfits?: SavedOutfitItem[]; total?: number } }>()
const emit = defineEmits<{ applied: [] }>()
const router = useRouter()
const LIMIT = 8
const items = computed(() => (props.payload.outfits || []).slice(0, LIMIT))
const total = computed(() => Math.max(props.payload.total ?? 0, props.payload.outfits?.length ?? 0))
const cache: Map<string, Promise<OutfitScene>> = ((globalThis as unknown as { __agentOutfitScenes?: Map<string, Promise<OutfitScene>> }).__agentOutfitScenes ??= new Map())
// undefined = loading, null = unavailable.
const scenes = reactive<Record<string, OutfitScene | null>>({})
const key = (o: SavedOutfitItem) => `${o.id}:${o.revision}`
function loadScenes() {
  for (const outfit of items.value) {
    const k = key(outfit)
    if (k in scenes) continue
    let p = cache.get(k)
    if (!p) { p = closetApi.outfit(outfit.id).then(o => o.scene); cache.set(k, p); p.catch(() => cache.delete(k)) }
    p.then(scene => { scenes[k] = scene?.elements?.length ? scene : null }, () => { scenes[k] = null })
  }
}
onMounted(loadScenes); watch(items, loadScenes)
function updated(ms: number, now = Date.now()) {
  if (!ms) return ''
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return '刚刚更新'
  if (minutes < 60) return `${minutes} 分钟前更新`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前更新`
  if (minutes < 43_200) return `${Math.floor(minutes / 1440)} 天前更新`
  return `${new Date(ms).toLocaleDateString()} 更新`
}
function open(path: string) { void router.push(path); emit('applied') }
function action(outfit: SavedOutfitItem, { key: k }: { key: string | number }) {
  if (k === 'edit') prefillAssistant(`帮我修改搭配「${outfit.name}」：`)
  else if (k === 'wear') sendToAssistant(`今天穿了「${outfit.name}」这套`)
}
</script>
<template>
  <section class="agent-outfit-list" aria-label="已保存的搭配">
    <small class="muted">你保存了 {{ total }} 套搭配<template v-if="total > items.length">，这里是最近的 {{ items.length }} 套</template>：</small>
    <p v-if="!items.length" class="agent-card-empty">还没有保存的搭配。<a-button type="link" size="small" @click="open('/outfits/new')">去搭一套</a-button></p>
    <div v-else class="agent-outfit-grid">
      <article v-for="outfit in items" :key="outfit.id" class="agent-outfit-item">
        <a-button type="text" class="agent-outfit-thumb" :aria-label="`打开搭配「${outfit.name}」`" @click="open(`/outfits/${outfit.id}`)">
          <OutfitThumbnail v-if="scenes[key(outfit)]" :scene="scenes[key(outfit)]!" :title="outfit.name" />
          <span v-else-if="scenes[key(outfit)] === null" class="agent-card-placeholder">暂无预览</span>
          <a-skeleton-image v-else class="agent-card-skeleton" />
        </a-button>
        <strong :title="outfit.name">{{ outfit.name || '未命名搭配' }}</strong>
        <small>{{ updated(outfit.updatedAtMs) }}</small>
        <div class="agent-outfit-actions">
          <a-button size="small" @click="open(`/outfits/${outfit.id}`)">打开</a-button>
          <a-dropdown :trigger="['click']"><a-button size="small" :aria-label="`搭配「${outfit.name}」更多操作`"><MoreOutlined /></a-button>
            <template #overlay><a-menu @click="action(outfit, $event)"><a-menu-item key="edit">改一改</a-menu-item><a-menu-item key="wear">今天穿了</a-menu-item></a-menu></template>
          </a-dropdown>
        </div>
      </article>
    </div>
    <a-button v-if="total > items.length" type="link" size="small" class="agent-card-more" @click="open('/outfits')">查看全部搭配（共 {{ total }} 套）</a-button>
  </section>
</template>
