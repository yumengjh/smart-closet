<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, EditOutlined, MoreOutlined } from '@ant-design/icons-vue'
import PageTitle from '../shell/PageTitle.vue'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import { closetApi } from '../services/api'
import { MAX_COLLECTION_NAME, collectionApi, inspirationApi, type Collection, type Inspiration } from '../services/inspirations'
import { mediaUrl } from '../services/urls'
import type { Outfit } from '../domain/outfit'

/** 一个合集（穿搭灵感设计 5.2）：里面的搭配和灵感；只用于整理和查看，不进推荐。删除合集不删里面的东西。 */
const route = useRoute(); const router = useRouter(); const { message, modal } = App.useApp()
const id = computed(() => String(route.params.id || ''))
const collection = ref<Collection | null>(null)
const outfits = ref<Outfit[]>([])
const inspirations = ref<Inspiration[]>([])
const error = ref('')
const loaded = ref(false)
const renaming = ref(false)
const name = ref('')

async function load() {
  error.value = ''; loaded.value = false
  try {
    const [list, allOutfits, page] = await Promise.all([collectionApi.list(), closetApi.outfits(), inspirationApi.list({ collection: id.value, limit: 60 })])
    const found = list.items.find(item => item.id === id.value)
    if (!found) { error.value = '这个合集不在了。'; return }
    collection.value = found
    outfits.value = allOutfits.filter(item => item.collectionIds?.includes(id.value))
    inspirations.value = page.items
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '合集没有打开。' }
  finally { loaded.value = true }
}
watch(id, () => { if (id.value) void load() }, { immediate: true })

function startRename() { name.value = collection.value?.name || ''; renaming.value = true }
async function rename() {
  if (!collection.value || !name.value.trim()) return
  try { collection.value = await collectionApi.update(collection.value.id, { name: name.value.trim() }); renaming.value = false }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '没有改好，请重试。') }
}
async function removeItem(kind: 'OUTFIT' | 'INSPIRATION', refId: string) {
  try {
    await collectionApi.removeItem(id.value, kind, refId)
    if (kind === 'OUTFIT') outfits.value = outfits.value.filter(item => item.id !== refId)
    else inspirations.value = inspirations.value.filter(item => item.id !== refId)
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有移出，请重试。') }
}
function remove() {
  const target = collection.value
  if (!target) return
  modal.confirm({
    title: `删除“${target.name}”？`, content: '只删合集，里面的搭配和收藏的图都还在。', okText: '删除', cancelText: '保留', okButtonProps: { danger: true },
    async onOk() { await collectionApi.remove(target.id); message.success('删掉了'); void router.replace('/inspirations') },
  })
}
const empty = computed(() => loaded.value && !outfits.value.length && !inspirations.value.length)
</script>

<template>
  <PageTitle :title="collection?.name || '合集'" :count="collection ? outfits.length + inspirations.length : null" unit="项" />
  <div class="co">
    <header class="co-head">
      <a-button type="text" shape="circle" aria-label="返回" @click="router.back()"><ArrowLeftOutlined /></a-button>
      <h2 v-if="!renaming" class="co-name">{{ collection?.name }}</h2>
      <a-space-compact v-else class="co-rename">
        <a-input v-model:value="name" :maxlength="MAX_COLLECTION_NAME" aria-label="合集名称" @press-enter="rename" />
        <a-button type="primary" :disabled="!name.trim()" @click="rename">好</a-button>
        <a-button @click="renaming = false">取消</a-button>
      </a-space-compact>
      <a-dropdown v-if="collection && !renaming" :trigger="['click']" placement="bottomRight">
        <a-button type="text" shape="circle" aria-label="合集操作"><MoreOutlined /></a-button>
        <template #overlay><a-menu><a-menu-item @click="startRename"><EditOutlined /> 改名</a-menu-item><a-menu-divider /><a-menu-item danger @click="remove">删除合集</a-menu-item></a-menu></template>
      </a-dropdown>
    </header>
    <a-alert v-if="error" type="warning" :message="error" show-icon><template #action><a-button size="small" @click="router.replace('/inspirations')">去穿搭收藏</a-button></template></a-alert>
    <a-skeleton v-else-if="!loaded" active :paragraph="{ rows: 6 }" />
    <template v-else>
      <section v-if="outfits.length" class="co-section" aria-label="搭配">
        <h3>搭配 <small>{{ outfits.length }}</small></h3>
        <div class="co-outfits">
          <article v-for="outfit in outfits" :key="outfit.id" class="co-outfit">
            <RouterLink :to="`/outfits/${outfit.id}`" class="co-outfit-thumb"><OutfitThumbnail :scene="outfit.scene" :title="outfit.name" /></RouterLink>
            <div class="co-row"><RouterLink :to="`/outfits/${outfit.id}`" class="co-title">{{ outfit.name }}</RouterLink><a-button type="link" size="small" @click="removeItem('OUTFIT', outfit.id)">移出</a-button></div>
          </article>
        </div>
      </section>
      <section v-if="inspirations.length" class="co-section" aria-label="穿搭收藏">
        <h3>收藏的图 <small>{{ inspirations.length }}</small></h3>
        <div class="co-grid">
          <article v-for="item in inspirations" :key="item.id" class="co-card">
            <RouterLink :to="`/inspirations/${item.id}`"><img :src="mediaUrl(item.thumbUrl)" :style="{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : '3 / 4' }" alt="" loading="lazy" /></RouterLink>
            <a-button type="link" size="small" class="co-remove" @click="removeItem('INSPIRATION', item.id)">移出</a-button>
          </article>
        </div>
      </section>
      <div v-if="empty" class="co-empty"><p>还是空的。在搭配或穿搭收藏里点“放进合集”就能放进来。</p></div>
    </template>
  </div>
</template>

<style scoped>
.co { max-width: 1080px; margin: 0 auto; }
.co-head { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.co-head > .ant-btn:first-child { margin-left: -8px; }
.co-name { flex: 1; min-width: 0; margin: 0; overflow: hidden; font-size: 18px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.co-rename { flex: 1; max-width: 360px; }
.co-section { margin-bottom: 24px; }
.co-section h3 { margin: 0 0 10px; font-size: 14px; font-weight: 600; color: var(--ink); }
.co-section h3 small { margin-left: 4px; color: var(--muted-subtle); font-weight: 400; }
.co-outfits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.co-outfit { min-width: 0; overflow: hidden; border-radius: 14px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.co-outfit-thumb { display: block; background: var(--surface-alt); }
.co-row { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 6px 4px 6px 10px; }
.co-title { min-width: 0; overflow: hidden; color: var(--ink); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.co-grid { columns: 2; column-gap: 10px; }
.co-card { position: relative; margin-bottom: 10px; overflow: hidden; break-inside: avoid; border-radius: 14px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.co-card img { display: block; width: 100%; height: auto; object-fit: cover; background: var(--surface-alt); }
.co-remove { display: block; margin-left: auto; }
.co-empty { padding: 40px 16px; border-radius: 16px; background: var(--surface-alt); color: var(--muted); font-size: 14px; text-align: center; }
.co-empty p { margin: 0; }
@media (min-width: 768px) { .co-outfits { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; } .co-grid { columns: 4; column-gap: 14px; } }
</style>
