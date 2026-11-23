<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons-vue'
import PageTitle from '../shell/PageTitle.vue'
import CollectionCover from '../components/collections/CollectionCover.vue'
import { goBack } from '../shell/goBack'
import { closetApi } from '../services/api'
import { COLLECTION_SUGGESTIONS, MAX_COLLECTION_NAME, collectionApi, type Collection } from '../services/inspirations'
import type { Outfit } from '../domain/outfit'
import { track } from '../services/analytics'
import { playSound } from '../services/sound'

/**
 * 全部合集（体验改版，2026-11-23）：每个合集是一摞照片，下面写名字和里面有几套搭配、几张图；“⋯”里改名、删除。
 * 合集只用来整理和查看，不进推荐。?new=1 进来直接弹出“新合集”。
 */
const route = useRoute(); const router = useRouter(); const { message, modal } = App.useApp()
const collections = ref<Collection[]>([])
const max = ref(30)
const loaded = ref(false)
const error = ref('')
const outfits = ref(new Map<string, Outfit>())

async function load() {
  error.value = ''
  try {
    const page = await collectionApi.list()
    collections.value = page.items; max.value = page.max
    if (page.items.some(c => !c.coverThumbUrls?.length && c.coverOutfitId)) outfits.value = new Map((await closetApi.outfits()).map(o => [o.id, o]))
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '合集没有加载出来。' }
  finally { loaded.value = true }
}

// 新合集 / 改名共用一个小对话框
const naming = ref<{ mode: 'new' | 'rename'; target?: Collection } | null>(null)
const name = ref('')
const saving = ref(false)
function startNew(preset = '') { naming.value = { mode: 'new' }; name.value = preset }
function startRename(target: Collection) { naming.value = { mode: 'rename', target }; name.value = target.name }
async function submitName() {
  const value = name.value.trim()
  if (!value || !naming.value) return
  saving.value = true
  try {
    if (naming.value.mode === 'new') {
      const created = await collectionApi.create(value)
      track('collection_created', {}); playSound('pop')
      naming.value = null
      void router.push(`/collections/${created.id}`)
    } else {
      const updated = await collectionApi.update(naming.value.target!.id, { name: value })
      collections.value = collections.value.map(c => c.id === updated.id ? { ...c, name: updated.name } : c)
      naming.value = null; message.success('改好了')
    }
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有保存，请重试。') }
  finally { saving.value = false }
}
function remove(target: Collection) {
  modal.confirm({
    title: `删除“${target.name}”？`, content: '只删合集，里面的搭配和图都还在。', okText: '删除', cancelText: '保留', okButtonProps: { danger: true },
    async onOk() { await collectionApi.remove(target.id); collections.value = collections.value.filter(c => c.id !== target.id); playSound('drop'); message.success('删掉了') },
  })
}
function menu(target: Collection, key: string | number) { if (key === 'rename') startRename(target); else if (key === 'delete') remove(target) }
const full = computed(() => collections.value.length >= max.value)
const summary = (c: Collection) => [c.outfitCount ? `${c.outfitCount} 套搭配` : '', c.inspirationCount ? `${c.inspirationCount} 张图` : ''].filter(Boolean).join(' · ') || '还是空的'

onMounted(() => { void load(); if (route.query.new === '1') { startNew(); void router.replace({ query: {} }) } })
</script>

<template>
  <PageTitle title="合集" :count="collections.length || null" unit="个" hint="把喜欢的搭配和穿搭图放在一起，比如“周末”“旅行”。只用来整理，不影响推荐。" />
  <div class="cs">
    <header class="cs-head">
      <a-button type="text" shape="circle" aria-label="返回" @click="goBack(router, '/inspirations')"><ArrowLeftOutlined /></a-button>
      <h2>合集</h2>
    </header>
    <a-alert v-if="error" type="warning" :message="error" show-icon class="cs-alert"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-skeleton v-if="!loaded" active :paragraph="{ rows: 5 }" />
    <template v-else>
      <div class="cs-grid">
        <button v-if="!full" type="button" class="cs-tile cs-new" @click="startNew()">
          <span class="cs-new-icon"><PlusOutlined /></span><b>新合集</b><small>放一组喜欢的</small>
        </button>
        <article v-for="item in collections" :key="item.id" class="cs-tile">
          <RouterLink :to="`/collections/${item.id}`" class="cs-link"><CollectionCover :collection="item" :outfits="outfits" /></RouterLink>
          <div class="cs-meta">
            <RouterLink :to="`/collections/${item.id}`" class="cs-name">{{ item.name }}</RouterLink>
            <a-dropdown :trigger="['click']" placement="bottomRight">
              <a-button type="text" size="small" shape="circle" :aria-label="`${item.name}的更多操作`"><MoreOutlined /></a-button>
              <template #overlay><a-menu @click="({ key }: { key: string | number }) => menu(item, key)"><a-menu-item key="rename"><EditOutlined /> 改名</a-menu-item><a-menu-divider /><a-menu-item key="delete" danger><DeleteOutlined /> 删除</a-menu-item></a-menu></template>
            </a-dropdown>
          </div>
          <small>{{ summary(item) }}</small>
        </article>
      </div>
      <div v-if="!collections.length" class="cs-empty">
        <p>还没有合集，先建一个？</p>
        <div class="cs-suggest"><a-button v-for="word in COLLECTION_SUGGESTIONS" :key="word" shape="round" @click="startNew(word)">{{ word }}</a-button></div>
      </div>
      <p v-if="full" class="cs-note">最多 {{ max }} 个合集</p>
    </template>
  </div>

  <a-modal :open="!!naming" :title="naming?.mode === 'rename' ? '改个名字' : '新合集'" :ok-text="naming?.mode === 'rename' ? '保存' : '建好'" cancel-text="取消" :confirm-loading="saving" :ok-button-props="{ disabled: !name.trim() }" width="360px" destroy-on-close @ok="submitName" @cancel="naming = null">
    <a-input v-model:value="name" :maxlength="MAX_COLLECTION_NAME" placeholder="比如 周末、旅行、面试" aria-label="合集名称" autofocus @press-enter="submitName" />
  </a-modal>
</template>

<style scoped>
.cs { max-width: 1080px; margin: 0 auto; }
.cs-head { display: flex; align-items: center; gap: 6px; margin-bottom: 16px; }
.cs-head > .ant-btn { margin-left: -8px; }
.cs-head h2 { margin: 0; color: var(--ink); font-size: 20px; font-weight: 600; }
.cs-alert { margin-bottom: 12px; }
.cs-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 14px; }
.cs-tile { display: grid; gap: 2px; min-width: 0; }
.cs-link { display: block; }
.cs-meta { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-top: 4px; }
.cs-name { min-width: 0; overflow: hidden; color: var(--ink); font-size: 14px; font-weight: 500; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.cs-tile small { color: var(--muted-subtle); font-size: 12px; }
.cs-new { justify-items: start; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.cs-new-icon { display: grid; place-items: center; width: 100%; aspect-ratio: 1; border: 1.5px dashed var(--line-strong, var(--line)); border-radius: 14px; color: var(--muted); font-size: 24px; }
.cs-new b { margin-top: 4px; color: var(--ink); font-size: 14px; font-weight: 500; }
.cs-empty { display: grid; justify-items: center; gap: 10px; margin-top: 20px; color: var(--muted); }
.cs-empty p { margin: 0; }
.cs-suggest { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.cs-note { margin-top: 16px; color: var(--muted); font-size: 12px; }
@media (min-width: 768px) { .cs-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px 18px; } }
@media (min-width: 1024px) { .cs-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
</style>
