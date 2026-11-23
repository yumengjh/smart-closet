<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, DeleteOutlined, FolderAddOutlined } from '@ant-design/icons-vue'
import PageTitle from '../shell/PageTitle.vue'
import CollectionPicker from '../components/collections/CollectionPicker.vue'
import { MAX_INSPIRATION_NOTE, collectionApi, inspirationApi, type Collection, type Inspiration } from '../services/inspirations'
import { mediaUrl } from '../services/urls'
import { track } from '../services/analytics'
import { playSound } from '../services/sound'

/**
 * 一张灵感（设计 4.9）：原图、备注、放进合集、删除。第一期还没有“看看怎么穿”（拆解）与“存成动作卡”。
 * 原图只经本人鉴权地址读取；这里不提供下载、分享或“用这张生图”。
 */
const route = useRoute(); const router = useRouter(); const { message, modal } = App.useApp()
const id = computed(() => String(route.params.id || ''))
const item = ref<Inspiration | null>(null)
const error = ref('')
const note = ref('')
const savingNote = ref(false)
const picking = ref(false)
const collections = ref<Collection[]>([])

async function load() {
  error.value = ''; item.value = null
  try {
    const [found, list] = await Promise.all([inspirationApi.get(id.value), collectionApi.list().catch(() => ({ items: [] as Collection[], max: 30 }))])
    item.value = found; note.value = found.note || ''; collections.value = list.items
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '这张灵感没有打开。' }
}
watch(id, () => { if (id.value) void load() }, { immediate: true })

const noteChanged = computed(() => !!item.value && note.value.trim() !== (item.value.note || ''))
async function saveNote() {
  if (!item.value || !noteChanged.value) return
  savingNote.value = true
  try { item.value = await inspirationApi.updateNote(item.value.id, note.value.trim() || null); message.success('记下了') }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '备注没有保存，请重试。') }
  finally { savingNote.value = false }
}
const inCollections = computed(() => collections.value.filter(c => item.value?.collectionIds.includes(c.id)))
function collectionsChanged(ids: string[]) { if (item.value) item.value = { ...item.value, collectionIds: ids }; void collectionApi.list().then(list => { collections.value = list.items }).catch(() => undefined) }

function remove() {
  if (!item.value) return
  const target = item.value
  modal.confirm({
    title: '删除这张灵感？', content: '图片会彻底删除。用它存成的搭配不受影响。', okText: '删除', cancelText: '保留', okButtonProps: { danger: true },
    async onOk() {
      await inspirationApi.remove(target.id)
      track('inspiration_deleted', {})
      playSound('drop')
      message.success('删掉了')
      void router.replace('/inspirations')
    },
  })
}
</script>

<template>
  <PageTitle title="灵感" />
  <div class="id">
    <header class="id-head">
      <a-button type="text" shape="circle" aria-label="返回灵感" @click="router.push('/inspirations')"><ArrowLeftOutlined /></a-button>
      <span class="id-spacer" />
      <a-button type="text" shape="circle" aria-label="放进合集" :disabled="!item" @click="picking = true"><FolderAddOutlined /></a-button>
      <a-button type="text" shape="circle" danger aria-label="删除" :disabled="!item" @click="remove"><DeleteOutlined /></a-button>
    </header>
    <a-alert v-if="error" type="warning" :message="error" show-icon><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-skeleton v-else-if="!item" active :paragraph="{ rows: 8 }" />
    <div v-else class="id-body">
      <figure class="id-figure"><img :src="mediaUrl(item.imageUrl)" alt="穿搭截图" /></figure>
      <section class="id-side">
        <div v-if="inCollections.length" class="id-tags">
          <RouterLink v-for="c in inCollections" :key="c.id" :to="`/collections/${c.id}`"><a-tag :bordered="false">{{ c.name }}</a-tag></RouterLink>
        </div>
        <a-textarea v-model:value="note" :maxlength="MAX_INSPIRATION_NOTE" show-count :auto-size="{ minRows: 2, maxRows: 6 }" placeholder="想记点什么？比如在哪刷到的、想学哪里" aria-label="备注" @blur="saveNote" />
        <a-button v-if="noteChanged" type="primary" :loading="savingNote" class="id-save" @click="saveNote">保存备注</a-button>
        <a-button block class="id-collect" @click="picking = true"><FolderAddOutlined /> 放进合集</a-button>
        <p class="id-private">只有你自己看得到，不会拿去生图。</p>
      </section>
    </div>
  </div>
  <CollectionPicker v-if="item" :open="picking" kind="INSPIRATION" :ref-id="item.id" :selected="item.collectionIds" @close="picking = false" @changed="collectionsChanged" />
</template>

<style scoped>
.id { max-width: 1080px; margin: 0 auto; }
.id-head { display: flex; align-items: center; gap: 4px; margin-bottom: 12px; }
.id-head > .ant-btn:first-child { margin-left: -8px; }
.id-head > .ant-btn:last-child { margin-right: -8px; }
.id-spacer { flex: 1; }
.id-body { display: grid; gap: 16px; }
.id-figure { margin: 0; overflow: hidden; border-radius: 16px; background: var(--surface-alt); }
.id-figure img { display: block; width: 100%; max-height: 78vh; object-fit: contain; }
.id-side { display: flex; flex-direction: column; gap: 12px; }
.id-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.id-tags :deep(.ant-tag) { margin: 0; }
.id-save { align-self: flex-end; }
.id-collect { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.id-private { margin: 0; color: var(--muted-subtle); font-size: 12px; }
@media (min-width: 900px) { .id-body { grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr); align-items: start; } .id-side { position: sticky; top: 16px; } }
</style>
