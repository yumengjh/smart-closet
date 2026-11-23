<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { ArrowLeftOutlined, BulbOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined, FolderAddOutlined, HeartOutlined, MoreOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons-vue'
import PageTitle from '../shell/PageTitle.vue'
import { goBack } from '../shell/goBack'
import CollectionPicker from '../components/collections/CollectionPicker.vue'
import InspirationReplica from '../inspiration/InspirationReplica.vue'
import InspirationFigure from '../inspiration/InspirationFigure.vue'
import PoseCard from '../ootd/PoseCard.vue'
import { MAX_INSPIRATION_NOTE, collectionApi, inspirationApi, type Collection, type Inspiration, type InspirationItem } from '../services/inspirations'
import type { Pose } from '../services/platform'
import { mediaUrl } from '../services/urls'
import { createUuid } from '../domain/id'
import { ApiError } from '../domain/apiError'
import { track } from '../services/analytics'
import { playSound } from '../services/sound'
import { useClosetStore } from '../stores/closet'
import { FAMILY_SWATCH, familyFromName } from '../wardrobe/rack'
import { wantedLabel } from '../wardrobe/wanted'
import { CLOTHING_ROLES, ROLE_OPTIONS, STANCE_LABEL, badge, boxStyle, itemChips } from '../inspiration/labels'
import { wantFromCrop } from '../inspiration/wantFromCrop'

/**
 * 一张穿搭收藏（体验改版，2026-11-23）：截图上标出每一件，点标记或卡片互相高亮；下面按 衣服 / 配饰 / 姿势 / 怎么穿 分组。
 * “看看怎么穿”一次识图（异步，拒收不扣）；每一件可“收进种草”（裁剪图走快速入柜，AI 整理成单品图）；
 * 姿势“存成动作卡”后当场展开卡片。复刻效果不够好，服务端开关打开才显示。原图只经本人鉴权地址读取。
 */
const route = useRoute(); const router = useRouter(); const { message, modal } = App.useApp(); const closet = useClosetStore()
const id = computed(() => String(route.params.id || ''))
const item = ref<Inspiration | null>(null)
const error = ref('')
const note = ref('')
const savingNote = ref(false)
const picking = ref(false)
const collections = ref<Collection[]>([])
const replicaEnabled = ref(false)

// ---- 轮询（先声明：load() 一开始就会 stopPolling） ----
let timer = 0
let polls = 0
function stopPolling() { window.clearTimeout(timer); timer = 0; polls = 0 }

async function load() {
  error.value = ''; item.value = null; stopPolling(); active.value = null; savedPose.value = null
  try {
    const [found, list, caps] = await Promise.all([
      inspirationApi.get(id.value),
      collectionApi.list().catch(() => ({ items: [] as Collection[], max: 30 })),
      inspirationApi.capabilities().catch(() => ({ replica: false })),
    ])
    item.value = found; note.value = found.note || ''; collections.value = list.items; replicaEnabled.value = caps.replica
    if (found.status === 'ANALYZING') poll()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '这张图没有打开。' }
}

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

// ---- 看看怎么穿 ----
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

// ---- 图上标记与分组 ----
const showMarks = ref(true)
const active = ref<number | null>(null)
const items = computed(() => analysis.value?.items || [])
const clothes = computed(() => items.value.filter(i => CLOTHING_ROLES.has(i.role)))
const accessories = computed(() => items.value.filter(i => !CLOTHING_ROLES.has(i.role)))
/** 编号按截图里从上到下的顺序，和图上的标记一致。 */
const order = computed(() => new Map(items.value.map((i, n) => [i.index, n + 1])))
const marks = computed(() => items.value.map(i => ({ item: i, style: boxStyle(i.box) })).filter(m => m.style))
const cards = ref<HTMLElement | null>(null)
function select(index: number, from: 'mark' | 'card') {
  active.value = active.value === index ? null : index
  playSound('tick')
  if (from === 'mark' && active.value !== null) void nextTick(() => cards.value?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }))
}
// ---- 自己管理标记（体验改版）：挪框、调大小、补一件、改部位/品类/颜色、删掉；零模型调用，松手即存 ----
const editing = ref(false)
const editSaving = ref(false)
const form = ref({ role: 'OTHER', category: '', primaryColor: '' })
const activeItem = computed(() => items.value.find(i => i.index === active.value) || null)
watch(activeItem, current => { form.value = { role: current?.role || 'OTHER', category: current?.category || '', primaryColor: current?.primaryColor || '' } }, { immediate: true })
function toggleEditing() { editing.value = !editing.value; showMarks.value = true; if (!editing.value) active.value = null; playSound('tick') }
async function applyEdit(task: () => Promise<Inspiration>, done?: string) {
  editSaving.value = true
  try { item.value = await task(); if (done) message.success(done) }
  catch (cause) { playSound('denied'); message.error(cause instanceof Error ? cause.message : '没有改好，请重试。') }
  finally { editSaving.value = false }
}
function changeBox(index: number, box: number[]) { if (item.value) void applyEdit(() => inspirationApi.updateItem(item.value!.id, index, { box })) }
/** “＋ 加一件”：在截图中间放一个框并选中，用户再拖到位、调大小、写是什么（手机上比在空白处拖框好找）。 */
function addCentered() {
  if (editSaving.value) return
  // 已有框正好在中间时往右下错开一点，免得新框完全叠在上面看不出来。
  const taken = items.value.some(i => i.box && Math.abs(i.box[0] - 0.32) < 0.03 && Math.abs(i.box[1] - 0.32) < 0.03)
  const offset = taken ? 0.06 : 0
  void drawBox([0.32 + offset, 0.32 + offset, 0.68 + offset, 0.62 + offset])
}
async function drawBox(box: number[]) {
  if (!item.value) return
  const before = new Set(items.value.map(i => i.index))
  await applyEdit(() => inspirationApi.addItem(item.value!.id, { box, role: 'OTHER', category: '' }))
  const added = items.value.find(i => !before.has(i.index))
  if (added) { active.value = added.index; message.info('把框拖到那一件上，再写一下是什么'); void nextTick(() => (document.querySelector('.ix-edit-grid input[aria-label="是什么"]') as HTMLInputElement | null)?.focus({ preventScroll: true })) }
}
const formChanged = computed(() => !!activeItem.value && (form.value.role !== activeItem.value.role || form.value.category.trim() !== activeItem.value.category || form.value.primaryColor.trim() !== activeItem.value.primaryColor))
function saveForm() {
  const target = activeItem.value
  if (!item.value || !target || !formChanged.value) return
  void applyEdit(() => inspirationApi.updateItem(item.value!.id, target.index, { role: form.value.role, category: form.value.category.trim(), primaryColor: form.value.primaryColor.trim() }), '改好了')
}
function removeActive() {
  const target = activeItem.value
  if (!item.value || !target) return
  modal.confirm({
    title: `删掉 ${badge(order.value.get(target.index) || 0)}${target.category ? ` ${target.category}` : ''}？`, content: '只删这个标记和它的小图，截图不受影响。', okText: '删掉', cancelText: '保留', okButtonProps: { danger: true },
    async onOk() { active.value = null; await applyEdit(() => inspirationApi.removeItem(item.value!.id, target.index), '删掉了') },
  })
}

const swatch = (name: string) => { const family = familyFromName(name); return family ? FAMILY_SWATCH[family] : 'var(--line)' }

// ---- 收进种草：裁剪图走快速入柜，AI 整理成单品图 ----
const wanting = ref<number | null>(null)
const wanted = ref(new Set<number>())
function want(target: InspirationItem) {
  const owner = closet.user?.username
  if (!owner || !target.cropUrl) return
  modal.confirm({
    title: `把这件${target.category || '衣服'}收进${wantedLabel.value}？`,
    content: '只用这一件的小图，鱼搭会认出资料并在需要时用 AI 整理成干净的单品图，做好后出现在衣柜里。整张截图不会发出去。一般用 1～2 次。',
    okText: `收进${wantedLabel.value}`, cancelText: '先不',
    async onOk() {
      wanting.value = target.index
      try {
        await wantFromCrop(owner, target.cropUrl!, target.category)
        wanted.value = new Set([...wanted.value, target.index])
        playSound('pop'); message.success('收到了，整理好会出现在衣柜里')
      } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有收进去，请重试。') }
      finally { wanting.value = null }
    },
  })
}

// ---- 动作卡：不依赖拆解；存好后当场展开 ----
const posing = ref(false)
const savedPose = ref<Pose | null>(null)
async function savePose() {
  if (!item.value) return
  posing.value = true
  try {
    savedPose.value = await inspirationApi.poseCard(item.value.id)
    track('inspiration_pose_saved', {})
    playSound('pop')
    void nextTick(() => document.querySelector('.ix-pose-result')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  } catch (cause) { playSound('denied'); message.error(cause instanceof Error ? cause.message : '这次没认出动作，换一张试试。') }
  finally { posing.value = false }
}
function outfitSaved(outfitId: string) { if (item.value) item.value = { ...item.value, outfitIds: [...(item.value.outfitIds || []), outfitId] } }

function remove() {
  if (!item.value) return
  const target = item.value
  modal.confirm({
    title: '删除这张图？', content: '图片会彻底删除。用它存成的搭配、动作卡和收进种草的衣服都不受影响。', okText: '删除', cancelText: '保留', okButtonProps: { danger: true },
    async onOk() {
      await inspirationApi.remove(target.id)
      track('inspiration_deleted', {})
      playSound('drop'); message.success('删掉了')
      void router.replace('/inspirations')
    },
  })
}
function moreAction({ key }: { key: string | number }) { if (key === 'pose') void savePose(); else if (key === 'delete') remove(); else if (key === 'again') void analyze() }

watch(id, () => { if (id.value) void load() }, { immediate: true })
</script>

<template>
  <PageTitle title="穿搭收藏" />
  <div class="ix">
    <header class="ix-head">
      <a-button type="text" shape="circle" aria-label="返回" @click="goBack(router, '/inspirations')"><ArrowLeftOutlined /></a-button>
      <span class="ix-spacer" />
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
    <div v-else class="ix-body">
      <!-- 截图 + 标记：可以自己改 -->
      <section class="ix-stage">
        <InspirationFigure :image-url="item.imageUrl" :items="items" :order="order" :active="active" :editing="editing" :show="showMarks" @select="index => select(index, 'mark')" @change="changeBox" @draw="drawBox">
          <div v-if="marks.length || analysis" class="ix-tools">
            <a-button v-if="!editing && marks.length" size="small" shape="round" :aria-pressed="showMarks" @click="showMarks = !showMarks; active = null"><EyeInvisibleOutlined v-if="showMarks" /><EyeOutlined v-else />{{ showMarks ? '隐藏标记' : '显示标记' }}</a-button>
            <a-button v-if="analysis" size="small" shape="round" :type="editing ? 'primary' : 'default'" :loading="editSaving" @click="toggleEditing"><CheckOutlined v-if="editing" /><EditOutlined v-else />{{ editing ? '改好了' : '改标记' }}</a-button>
          </div>
        </InspirationFigure>
        <div v-if="editing" class="ix-edit">
          <div class="ix-edit-bar">
            <p class="ix-edit-hint">{{ activeItem ? '拖框挪位置，拖圆点调大小' : '点一个框来改，或者加上漏掉的一件' }}</p>
            <a-button size="small" :loading="editSaving" @click="addCentered"><PlusOutlined /> 加一件</a-button>
          </div>
          <template v-if="activeItem">
            <div class="ix-edit-head"><b>{{ badge(order.get(activeItem.index) || 0) }} {{ activeItem.category || '新的一件' }}</b><a-button type="link" size="small" @click="active = null">换一个</a-button></div>
            <div class="ix-edit-grid">
              <label>部位</label>
              <a-select v-model:value="form.role" :options="ROLE_OPTIONS" aria-label="部位" />
              <label>是什么</label>
              <a-input v-model:value="form.category" :maxlength="30" placeholder="比如 针织开衫" aria-label="是什么" @press-enter="saveForm" />
              <label>颜色</label>
              <a-input v-model:value="form.primaryColor" :maxlength="12" placeholder="比如 米白" aria-label="颜色" @press-enter="saveForm" />
            </div>
            <div class="ix-edit-actions">
              <a-button danger @click="removeActive"><DeleteOutlined /> 删掉这一件</a-button>
              <a-button type="primary" :disabled="!formChanged" :loading="editSaving" @click="saveForm">保存</a-button>
            </div>
          </template>
        </div>
      </section>

      <section class="ix-side">
        <!-- 还没看过：一屏只有这一个黑按钮 -->
        <div v-if="!analysis && !analyzing" class="ix-cta">
          <a-alert v-if="item.status === 'REJECTED' && item.rejectMessage" type="info" show-icon :message="item.rejectMessage" />
          <a-alert v-else-if="item.status === 'FAILED'" type="warning" show-icon message="这次没看成，没有扣次数，可以再试一次" />
          <a-button type="primary" size="large" block :loading="starting" @click="analyze"><BulbOutlined /> 看看怎么穿 · 1 次</a-button>
          <p>认出每一件、配饰和姿势，告诉你怎么穿</p>
        </div>
        <div v-else-if="analyzing" class="ix-working" role="status" aria-live="polite"><b>正在看这套怎么穿…</b><small>一般十几秒，可以先离开，回来再看</small></div>

        <template v-if="analysis">
          <div v-if="analysis.looks.length || analysis.seasons.length || analysis.occasions.length" class="ix-looks">
            <span v-for="look in analysis.looks" :key="look.id" class="ix-look">{{ look.label }}</span>
            <small v-if="analysis.seasons.length || analysis.occasions.length">{{ [...analysis.seasons, ...analysis.occasions].join(' · ') }}</small>
          </div>

          <section v-if="clothes.length" class="ix-sec" aria-label="衣服">
            <h3>衣服 <small>{{ clothes.length }}</small></h3>
            <div ref="cards" class="ix-cards">
              <article v-for="piece in clothes" :key="piece.index" class="ix-card" :class="{ on: active === piece.index }" :data-index="piece.index" @click="select(piece.index, 'card')">
                <div class="ix-card-img"><img v-if="piece.cropUrl" :src="mediaUrl(piece.cropUrl)" alt="" loading="lazy" /><em>{{ badge(order.get(piece.index) || 0) }}</em></div>
                <div class="ix-card-body">
                  <b>{{ piece.category || '一件衣服' }}</b>
                  <span v-if="piece.primaryColor" class="ix-color"><i :style="{ background: swatch(piece.primaryColor) }"></i>{{ [piece.primaryColor, ...piece.secondaryColors].join('、') }}</span>
                  <span v-if="itemChips(piece).length" class="ix-chips"><em v-for="chip in itemChips(piece)" :key="chip">{{ chip }}</em></span>
                  <p v-if="piece.description">{{ piece.description }}</p>
                  <a-button v-if="piece.cropUrl" size="small" class="ix-want" :type="wanted.has(piece.index) ? 'text' : 'default'" :disabled="wanted.has(piece.index)" :loading="wanting === piece.index" @click.stop="want(piece)">
                    <template v-if="wanted.has(piece.index)"><CheckOutlined /> 已收进{{ wantedLabel }}</template>
                    <template v-else><HeartOutlined /> 收进{{ wantedLabel }}</template>
                  </a-button>
                </div>
              </article>
            </div>
          </section>

          <section v-if="accessories.length" class="ix-sec" aria-label="配饰">
            <h3>配饰 <small>{{ accessories.length }}</small></h3>
            <div class="ix-accs">
              <button v-for="piece in accessories" :key="piece.index" type="button" class="ix-acc" :class="{ on: active === piece.index }" :aria-pressed="active === piece.index" @click="select(piece.index, 'card')">
                <img v-if="piece.cropUrl" :src="mediaUrl(piece.cropUrl)" alt="" loading="lazy" />
                <span><b>{{ piece.category }}</b><small>{{ [piece.primaryColor, piece.description].filter(Boolean).join(' · ') }}</small></span>
                <em>{{ badge(order.get(piece.index) || 0) }}</em>
              </button>
            </div>
          </section>

          <section class="ix-sec" aria-label="姿势">
            <h3>姿势</h3>
            <div class="ix-pose">
              <p v-if="analysis.pose && analysis.pose.stance !== 'NONE'"><b>{{ STANCE_LABEL[analysis.pose.stance] || '动作' }}</b>{{ analysis.pose.description ? ` · ${analysis.pose.description}` : '' }}</p>
              <p v-else class="ix-muted">{{ analysis.hasPose ? '看得出一个完整的动作' : '这张图的动作不太清楚，也可以试试' }}</p>
              <a-button v-if="!savedPose" :loading="posing" @click="savePose"><UserOutlined /> 存成动作卡</a-button>
            </div>
          </section>

          <section v-if="analysis.tips.length" class="ix-sec" aria-label="怎么穿">
            <h3>怎么穿</h3>
            <ul class="ix-tips"><li v-for="tip in analysis.tips" :key="tip">{{ tip }}</li></ul>
          </section>

          <InspirationReplica v-if="replicaEnabled" :inspiration="item" @saved="outfitSaved" />
        </template>

        <!-- 动作卡当场展开：没拆过也能存 -->
        <section v-if="savedPose" class="ix-pose-result" aria-label="存好的动作卡">
          <header><b>动作卡存好了</b><a-button type="text" size="small" shape="circle" aria-label="收起" @click="savedPose = null"><CloseOutlined /></a-button></header>
          <div class="ix-pose-card"><PoseCard :pose="savedPose" show-description animate /></div>
          <div class="ix-pose-actions">
            <a-button type="primary" @click="router.push('/try')">用它做张图</a-button>
          </div>
          <small>做上身图时，在“姿势”里选“{{ savedPose.name }}”</small>
        </section>

        <div class="ix-meta">
          <div v-if="inCollections.length" class="ix-tags">
            <RouterLink v-for="c in inCollections" :key="c.id" :to="`/collections/${c.id}`"><a-tag :bordered="false">{{ c.name }}</a-tag></RouterLink>
          </div>
          <a-textarea v-model:value="note" :maxlength="MAX_INSPIRATION_NOTE" show-count :auto-size="{ minRows: 1, maxRows: 5 }" placeholder="记一句：在哪刷到的、想学哪里" aria-label="备注" @blur="saveNote" />
          <a-button v-if="noteChanged" type="primary" size="small" :loading="savingNote" class="ix-save" @click="saveNote">保存备注</a-button>
          <div class="ix-row">
            <a-button @click="picking = true"><FolderAddOutlined /> 放进合集</a-button>
            <a-button v-if="!analysis" :loading="posing" @click="savePose"><UserOutlined /> 存成动作卡</a-button>
          </div>
          <p class="ix-private">只有你自己看得到；整张截图不会拿去生图。</p>
        </div>
      </section>
    </div>
  </div>
  <CollectionPicker v-if="item" :open="picking" kind="INSPIRATION" :ref-id="item.id" :selected="item.collectionIds" @close="picking = false" @changed="collectionsChanged" />
</template>

<style scoped>
.ix { max-width: 1080px; margin: 0 auto; }
.ix-head { display: flex; align-items: center; gap: 4px; margin-bottom: 10px; }
.ix-head > .ant-btn:first-child { margin-left: -8px; }
.ix-head > :last-child { margin-right: -8px; }
.ix-spacer { flex: 1; }
.ix-body { display: grid; gap: 16px; }


.ix-tools { position: absolute; right: 10px; bottom: 10px; z-index: 2; display: flex; gap: 6px; }
.ix-tools .ant-btn { display: inline-flex; align-items: center; gap: 4px; border: 0; background: var(--glass, #ffffffd9); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.ix-tools .ant-btn-primary { color: var(--action-fg, #fff); background: var(--action-bg, var(--ink)); }
.ix-edit { display: grid; gap: 10px; margin-top: 10px; padding: 12px 14px; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.ix-edit-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ix-edit-bar .ant-btn { flex: none; display: inline-flex; align-items: center; gap: 4px; }
.ix-edit-hint { margin: 0; color: var(--muted); font-size: 13px; }
.ix-edit-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 8px; }
.ix-edit-head b { color: var(--ink); font-size: 14px; }
.ix-edit-head small { color: var(--muted); font-size: 12px; }
.ix-edit-grid { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px 10px; }
.ix-edit-grid label { color: var(--muted); font-size: 13px; }
.ix-edit-actions { display: flex; justify-content: space-between; gap: 8px; }
.ix-edit-actions .ant-btn { display: inline-flex; align-items: center; gap: 4px; }
.ix-side { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.ix-cta { display: grid; gap: 8px; }
.ix-cta .ant-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.ix-cta p { margin: 0; color: var(--muted); font-size: 12px; text-align: center; }
.ix-working { display: grid; gap: 4px; padding: 18px 16px; border-radius: 14px; text-align: center; color: var(--muted-strong); background: linear-gradient(110deg, var(--surface-alt) 30%, var(--surface) 50%, var(--surface-alt) 70%); background-size: 220% 100%; animation: ix-shine 1.6s linear infinite; }
.ix-working b { font-size: 14px; font-weight: 600; }
.ix-working small { color: var(--muted); font-size: 12px; }
@keyframes ix-shine { to { background-position: -220% 0; } }

.ix-looks { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.ix-look { padding: 2px 10px; border-radius: 999px; background: var(--surface-alt); color: var(--ink); font-size: 13px; }
.ix-looks small { color: var(--muted); font-size: 12px; }

.ix-sec h3 { display: flex; align-items: baseline; gap: 6px; margin: 0 0 10px; font-size: 15px; font-weight: 600; color: var(--ink); }
.ix-sec h3 small { color: var(--muted-subtle); font-size: 12px; font-weight: 400; }

/* 衣服：横滑卡片 */
.ix-cards { display: flex; gap: 10px; margin: 0 -16px; padding: 2px 16px 6px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.ix-card { flex: 0 0 min(78%, 280px); display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 10px; padding: 10px; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); scroll-snap-align: start; cursor: pointer; transition: box-shadow .2s ease; }
.ix-card.on { box-shadow: 0 0 0 2px var(--ink); }
.ix-card-img { position: relative; width: 84px; height: 112px; overflow: hidden; border-radius: 12px; background: var(--surface-alt); }
.ix-card-img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ix-card-img em { position: absolute; left: 4px; top: 4px; display: grid; place-items: center; min-width: 20px; height: 20px; border-radius: 10px; background: #111111cc; color: #fff; font-size: 12px; font-style: normal; }
.ix-card-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ix-card-body b { font-size: 14px; font-weight: 600; color: var(--ink); }
.ix-color { display: inline-flex; align-items: center; gap: 6px; color: var(--muted-strong); font-size: 12px; }
.ix-color i { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 1px #0000001f; }
.ix-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ix-chips em { padding: 0 6px; border-radius: 6px; background: var(--surface-alt); color: var(--muted-strong); font-size: 11px; font-style: normal; line-height: 18px; }
.ix-card-body p { display: -webkit-box; margin: 0; overflow: hidden; color: var(--muted); font-size: 12px; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ix-want.ant-btn { align-self: flex-start; margin-top: auto; display: inline-flex; align-items: center; gap: 4px; padding-inline: 8px; }

/* 配饰：一行一件 */
.ix-accs { display: grid; gap: 8px; }
.ix-acc { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 10px 6px 6px; border: 0; border-radius: 12px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); text-align: left; cursor: pointer; }
.ix-acc.on { box-shadow: 0 0 0 2px var(--ink); }
.ix-acc img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: var(--surface-alt); }
.ix-acc span { display: grid; min-width: 0; }
.ix-acc b { font-size: 13px; font-weight: 500; color: var(--ink); }
.ix-acc small { overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.ix-acc em { color: var(--muted-subtle); font-style: normal; }

/* 姿势 */
.ix-pose { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface-alt); }
.ix-pose p { flex: 1 1 200px; margin: 0; color: var(--muted-strong); font-size: 14px; }
.ix-pose p b { color: var(--ink); font-weight: 600; }
.ix-pose .ant-btn { display: inline-flex; align-items: center; gap: 6px; }
.ix-muted { color: var(--muted) !important; }
.ix-pose-result { display: grid; gap: 10px; padding: 14px; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); animation: ix-rise .3s cubic-bezier(.2, .9, .2, 1); }
.ix-pose-result header { display: flex; align-items: center; justify-content: space-between; }
.ix-pose-result header b { font-size: 15px; color: var(--ink); }
.ix-pose-card { max-width: 220px; }
.ix-pose-actions .ant-btn { width: 100%; }
.ix-pose-result small { color: var(--muted); font-size: 12px; }
@keyframes ix-rise { from { opacity: 0; transform: translateY(8px); } }

.ix-tips { display: grid; gap: 6px; margin: 0; padding-left: 18px; color: var(--muted-strong); font-size: 14px; }

.ix-meta { display: grid; gap: 10px; padding-top: 4px; border-top: 1px solid var(--line); }
.ix-tags { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 10px; }
.ix-tags :deep(.ant-tag) { margin: 0; }
.ix-meta > .ant-input-textarea, .ix-meta > textarea { margin-top: 10px; }
.ix-save { justify-self: end; }
.ix-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.ix-row .ant-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.ix-private { margin: 0; color: var(--muted-subtle); font-size: 12px; }

@media (min-width: 900px) {
  .ix-body { grid-template-columns: minmax(0, 1.2fr) minmax(340px, 1fr); align-items: start; }
  .ix-stage { position: sticky; top: 16px; }
  .ix-cards { flex-direction: column; margin: 0; padding: 0; overflow: visible; }
  .ix-card { flex: none; }
}
@media (prefers-reduced-motion: reduce) { .ix-working, .ix-pose-result { animation: none; } .ix-card { transition: none; } }
</style>
