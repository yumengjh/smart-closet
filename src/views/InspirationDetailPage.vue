<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, BulbOutlined, DeleteOutlined, FolderAddOutlined, MoreOutlined, UserOutlined } from '@ant-design/icons-vue'
import PageTitle from '../shell/PageTitle.vue'
import CollectionPicker from '../components/collections/CollectionPicker.vue'
import InspirationReplica from '../inspiration/InspirationReplica.vue'
import { MAX_INSPIRATION_NOTE, collectionApi, inspirationApi, type Collection, type Inspiration } from '../services/inspirations'
import { mediaUrl } from '../services/urls'
import { createUuid } from '../domain/id'
import { ApiError } from '../domain/apiError'
import { track } from '../services/analytics'
import { playSound } from '../services/sound'

/**
 * 一张穿搭收藏（设计 4.4～4.9）：看图 →“看看怎么穿”（一次识图，异步，拒收不扣）→ 用自己的衣服复刻 → 存成搭配；
 * 也可以不拆解，直接把动作存成动作卡。原图只经本人鉴权地址读取；这里不提供下载、分享或“用这张生图”。
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
  error.value = ''; item.value = null; stopPolling()
  try {
    const [found, list] = await Promise.all([inspirationApi.get(id.value), collectionApi.list().catch(() => ({ items: [] as Collection[], max: 30 }))])
    item.value = found; note.value = found.note || ''; collections.value = list.items
    if (found.status === 'ANALYZING') poll()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '这张图没有打开。' }
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

// 看看怎么穿：同一次点击断网重试用同一个键，服务端只扣一次；结果出来后清掉。
let pendingKey = ''
const starting = ref(false)
const analyzing = computed(() => item.value?.status === 'ANALYZING')
const analysis = computed(() => item.value?.status === 'ANALYZED' ? item.value.analysis || null : null)
async function analyze() {
  if (!item.value || starting.value) return
  pendingKey ||= createUuid()
  starting.value = true
  try { item.value = await inspirationApi.analyze(item.value.id, pendingKey); poll() }
  catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) { poll(); return }
    playSound('denied'); message.error(cause instanceof Error ? cause.message : '这次没看成，请重试。')
  } finally { starting.value = false }
}
let timer = 0
let polls = 0
function stopPolling() { window.clearTimeout(timer); timer = 0; polls = 0 }
function poll() {
  window.clearTimeout(timer)
  timer = window.setTimeout(async () => {
    if (!item.value) return
    try {
      const next = await inspirationApi.get(item.value.id)
      item.value = next
      if (next.status === 'ANALYZING' && ++polls < 90) { poll(); return }
      stopPolling(); pendingKey = ''
      finished(next)
    } catch (cause) {
      stopPolling(); pendingKey = ''
      // 疑似未成年：图片已删、行被隐藏，读不到了。
      if (cause instanceof ApiError && cause.status === 404) { message.warning('这张图不太适合，已经删掉了，换一张吧'); void router.replace('/inspirations') }
    }
  }, polls < 4 ? 1500 : 2500)
}
function finished(next: Inspiration) {
  if (next.status === 'ANALYZED') { track('inspiration_analyzed', { result: 'ok' }); playSound('success') }
  else if (next.status === 'REJECTED') {
    track('inspiration_analyzed', { result: 'rejected' })
    if (next.rejectReason === 'MINOR_LIKELY') { message.warning(next.rejectMessage || '这张图不太适合，已经删掉了，换一张吧'); void router.replace('/inspirations') }
  } else if (next.status === 'FAILED') { track('inspiration_analyzed', { result: 'failed' }); playSound('error') }
}
onUnmounted(stopPolling)

// 动作卡：不依赖拆解；只留文字和关节点，不引用这张图。
const posing = ref(false)
async function savePose() {
  if (!item.value) return
  posing.value = true
  try {
    const card = await inspirationApi.poseCard(item.value.id)
    track('inspiration_pose_saved', {})
    playSound('pop')
    message.success(`动作“${card.name}”存好了，做上身图时可以选`)
  } catch (cause) { playSound('denied'); message.error(cause instanceof Error ? cause.message : '这次没认出动作，换一张试试。') }
  finally { posing.value = false }
}
function outfitSaved(outfitId: string) { if (item.value) item.value = { ...item.value, outfitIds: [...(item.value.outfitIds || []), outfitId] } }

function remove() {
  if (!item.value) return
  const target = item.value
  modal.confirm({
    title: '删除这张图？', content: '图片会彻底删除。用它存成的搭配和动作卡不受影响。', okText: '删除', cancelText: '保留', okButtonProps: { danger: true },
    async onOk() {
      await inspirationApi.remove(target.id)
      track('inspiration_deleted', {})
      playSound('drop')
      message.success('删掉了')
      void router.replace('/inspirations')
    },
  })
}
function moreAction({ key }: { key: string | number }) { if (key === 'pose') void savePose(); else if (key === 'delete') remove(); else if (key === 'again') void analyze() }
</script>

<template>
  <PageTitle title="穿搭收藏" />
  <div class="id">
    <header class="id-head">
      <a-button type="text" shape="circle" aria-label="返回穿搭收藏" @click="router.push('/inspirations')"><ArrowLeftOutlined /></a-button>
      <span class="id-spacer" />
      <a-button type="text" shape="circle" aria-label="放进合集" :disabled="!item" @click="picking = true"><FolderAddOutlined /></a-button>
      <a-dropdown :trigger="['click']" placement="bottomRight" :disabled="!item">
        <a-button type="text" shape="circle" aria-label="更多"><MoreOutlined /></a-button>
        <template #overlay><a-menu @click="moreAction">
          <a-menu-item key="pose" :disabled="posing"><UserOutlined /> 把动作存成动作卡</a-menu-item>
          <a-menu-item v-if="analysis" key="again" :disabled="analyzing"><BulbOutlined /> 再看一次 · 1 次</a-menu-item>
          <a-menu-divider />
          <a-menu-item key="delete" danger><DeleteOutlined /> 删除</a-menu-item>
        </a-menu></template>
      </a-dropdown>
    </header>
    <a-alert v-if="error" type="warning" :message="error" show-icon><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-skeleton v-else-if="!item" active :paragraph="{ rows: 8 }" />
    <div v-else class="id-body">
      <figure class="id-figure"><img :src="mediaUrl(item.imageUrl)" alt="穿搭截图" /></figure>
      <section class="id-side">
        <!-- 主操作：没拆过时“看看怎么穿”，一屏只有这一个黑按钮 -->
        <div v-if="!analysis && !analyzing" class="id-cta">
          <a-alert v-if="item.status === 'REJECTED' && item.rejectMessage" type="info" show-icon :message="item.rejectMessage" class="id-alert" />
          <a-alert v-else-if="item.status === 'FAILED'" type="warning" show-icon message="这次没看成，没有扣次数，可以再试一次" class="id-alert" />
          <a-button type="primary" size="large" block :loading="starting" @click="analyze"><BulbOutlined /> 看看怎么穿 · 1 次</a-button>
          <p class="id-hint">认出每一件和穿法，再从你的衣柜里找像的</p>
        </div>
        <div v-else-if="analyzing" class="id-working" role="status" aria-live="polite"><b>正在看这套怎么穿…</b><small>一般十几秒，可以先离开，回来再看</small></div>

        <template v-if="analysis">
          <div v-if="analysis.looks.length || analysis.seasons.length || analysis.occasions.length" class="id-looks">
            <a-tag v-for="look in analysis.looks" :key="look.id" :bordered="false" class="id-look">{{ look.label }}</a-tag>
            <small>{{ [...analysis.seasons, ...analysis.occasions].join(' · ') }}</small>
          </div>
          <section v-if="analysis.tips.length" class="id-tips" aria-label="怎么穿">
            <h3>怎么穿</h3>
            <ul><li v-for="tip in analysis.tips" :key="tip">{{ tip }}</li></ul>
          </section>
          <InspirationReplica :inspiration="item" @saved="outfitSaved" />
        </template>

        <div v-if="inCollections.length" class="id-tags">
          <RouterLink v-for="c in inCollections" :key="c.id" :to="`/collections/${c.id}`"><a-tag :bordered="false">{{ c.name }}</a-tag></RouterLink>
        </div>
        <a-textarea v-model:value="note" :maxlength="MAX_INSPIRATION_NOTE" show-count :auto-size="{ minRows: 2, maxRows: 6 }" placeholder="想记点什么？比如在哪刷到的、想学哪里" aria-label="备注" @blur="saveNote" />
        <a-button v-if="noteChanged" type="primary" :loading="savingNote" class="id-save" @click="saveNote">保存备注</a-button>
        <div class="id-row">
          <a-button class="id-soft" @click="picking = true"><FolderAddOutlined /> 放进合集</a-button>
          <a-button class="id-soft" :loading="posing" @click="savePose"><UserOutlined /> 存成动作卡</a-button>
        </div>
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
.id-head > :last-child { margin-right: -8px; }
.id-spacer { flex: 1; }
.id-body { display: grid; gap: 16px; }
.id-figure { margin: 0; overflow: hidden; border-radius: 16px; background: var(--surface-alt); }
.id-figure img { display: block; width: 100%; max-height: 70vh; object-fit: contain; }
.id-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.id-cta { display: grid; gap: 8px; }
.id-cta .ant-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.id-alert { margin: 0; }
.id-hint { margin: 0; color: var(--muted); font-size: 12px; text-align: center; }
.id-working { display: grid; gap: 4px; padding: 18px 16px; border-radius: 14px; text-align: center; color: var(--muted-strong); background: linear-gradient(110deg, var(--surface-alt) 30%, var(--surface) 50%, var(--surface-alt) 70%); background-size: 220% 100%; animation: id-shine 1.6s linear infinite; }
.id-working b { font-size: 14px; font-weight: 600; }
.id-working small { color: var(--muted); font-size: 12px; }
@keyframes id-shine { to { background-position: -220% 0; } }
.id-looks { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.id-look { margin: 0; color: var(--ink); background: var(--surface-alt); }
.id-looks small { color: var(--muted); font-size: 12px; }
.id-tips h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; color: var(--ink); }
.id-tips ul { display: grid; gap: 4px; margin: 0; padding-left: 18px; color: var(--muted-strong); font-size: 14px; }
.id-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.id-tags :deep(.ant-tag) { margin: 0; }
.id-save { align-self: flex-end; }
.id-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.id-soft { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.id-private { margin: 0; color: var(--muted-subtle); font-size: 12px; }
@media (min-width: 900px) { .id-body { grid-template-columns: minmax(0, 1.3fr) minmax(320px, 1fr); align-items: start; } .id-figure { position: sticky; top: 16px; } }
@media (prefers-reduced-motion: reduce) { .id-working { animation: none; } }
</style>
