<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { App } from 'ant-design-vue'
import { CloseOutlined, SkinOutlined } from '@ant-design/icons-vue'
import { activeCloset } from '../services/activeCloset'
import { closetApi, type Garment } from '../services/api'
import { MATCH_GRADE_LABEL, inspirationApi, type Inspiration, type InspirationMatches } from '../services/inspirations'
import { mediaUrl, thumbUrl } from '../services/urls'
import { candidateScene } from '../agent/bridge'
import { holdLabel, holdOf } from '../wardrobe/holds'
import { wantedLabel } from '../wardrobe/wanted'
import { track } from '../services/analytics'
import { celebrate } from '../services/celebrate'

/**
 * 用你的衣服复刻（穿搭收藏设计 4.6、4.7）：截图里每一件对上衣柜里最像的一件，点下面的小图换一件，× 去掉；
 * 缺的那件明说，不拿别的位置顶替；种草里像的单独列出，不进复刻版。匹配零模型调用。
 */
const props = defineProps<{ inspiration: Inspiration }>()
const emit = defineEmits<{ saved: [outfitId: string] }>()
const router = useRouter(); const { message } = App.useApp()
const matches = ref<InspirationMatches | null>(null)
const error = ref('')
const garments = ref(new Map<string, Garment>())
const chosen = ref(new Map<number, string | null>())
const saving = ref(false)
const savedId = ref('')

const items = computed(() => props.inspiration.analysis?.items || [])
const rowOf = (index: number) => matches.value?.items.find(row => row.index === index)

async function load() {
  error.value = ''; matches.value = null
  try {
    const [found, closet] = await Promise.all([inspirationApi.matches(props.inspiration.id), activeCloset()])
    const map = new Map(closet.map(item => [item.id, item]))
    // 种草不在 activeCloset 里，按需补取缩略图。
    const missing = found.items.flatMap(row => [...row.owned, ...row.wanted]).map(match => match.garmentId).filter(id => !map.has(id))
    await Promise.all([...new Set(missing)].map(async id => { const garment = await closetApi.detail(id).catch(() => undefined); if (garment) map.set(id, garment) }))
    garments.value = map
    const replica = new Set(found.replica.garmentIds)
    chosen.value = new Map(found.items.map(row => [row.index, row.owned.find(match => replica.has(match.garmentId))?.garmentId ?? null]))
    matches.value = found
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '没有找到可以复刻的衣服。' }
}
watch(() => `${props.inspiration.id}:${props.inspiration.analysis?.extractorVersion}:${props.inspiration.updatedAt}`, () => void load(), { immediate: true })

function choose(index: number, garmentId: string | null) { chosen.value = new Map(chosen.value).set(index, chosen.value.get(index) === garmentId ? null : garmentId) }
const picked = computed(() => [...new Set([...chosen.value.values()].filter((id): id is string => !!id))])
const missingMain = computed(() => !!matches.value?.replica.missingMain)
const anyMissing = computed(() => !!matches.value && (matches.value.replica.missing.length > 0 || items.value.some(item => !chosen.value.get(item.index))))
const name = computed(() => {
  const analysis = props.inspiration.analysis
  return [analysis?.looks[0]?.label, analysis?.occasions[0]].filter(Boolean).join('·') || '照着收藏搭的'
})
const garmentName = (id: string) => garments.value.get(id)?.name || garments.value.get(id)?.category?.[0] || '衣服'
const garmentThumb = (id: string) => thumbUrl(garments.value.get(id)?.displayUrl, 240) || ''

async function save() {
  if (!picked.value.length) return
  saving.value = true
  try {
    const scene = await candidateScene({ name: name.value, reason: '', garmentIds: picked.value })
    const outfit = await closetApi.saveOutfit(null, null, name.value, scene, null, props.inspiration.id)
    track('inspiration_outfit_saved', { missing: anyMissing.value })
    savedId.value = outfit.id
    void celebrate('milestone')
    emit('saved', outfit.id)
  } catch (cause) { message.error(cause instanceof Error ? cause.message : '没有存上，请重试。') }
  finally { saving.value = false }
}
</script>

<template>
  <section class="rp" aria-label="用你的衣服复刻">
    <h3>用你的衣服复刻</h3>
    <a-alert v-if="error" type="warning" :message="error" show-icon><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-skeleton v-else-if="!matches" active :paragraph="{ rows: 4 }" />
    <template v-else>
      <article v-for="item in items" :key="item.index" class="rp-row">
        <figure class="rp-crop"><img v-if="item.cropUrl" :src="mediaUrl(item.cropUrl)" alt="" loading="lazy" /><figcaption>{{ item.category }}</figcaption></figure>
        <div class="rp-body">
          <p class="rp-desc">{{ item.description }}</p>
          <template v-if="rowOf(item.index)?.owned.length">
            <div class="rp-picks" role="radiogroup" :aria-label="`选一件对应${item.category}`">
              <button v-for="match in rowOf(item.index)!.owned" :key="match.garmentId" type="button" class="rp-pick" :class="{ on: chosen.get(item.index) === match.garmentId }" role="radio" :aria-checked="chosen.get(item.index) === match.garmentId" :aria-label="`${garmentName(match.garmentId)}，${MATCH_GRADE_LABEL[match.grade]}`" @click="choose(item.index, match.garmentId)">
                <img v-if="garmentThumb(match.garmentId)" :src="garmentThumb(match.garmentId)" alt="" loading="lazy" />
                <em>{{ MATCH_GRADE_LABEL[match.grade] }}</em>
                <i v-if="match.held || holdOf(match.garmentId)" class="rp-held">{{ holdLabel(holdOf(match.garmentId)) || '不在' }}</i>
              </button>
              <a-button v-if="chosen.get(item.index)" type="text" size="small" shape="circle" aria-label="这件不要" @click="choose(item.index, chosen.get(item.index)!)"><CloseOutlined /></a-button>
            </div>
            <p v-if="chosen.get(item.index)" class="rp-why">{{ garmentName(chosen.get(item.index)!) }}<template v-if="rowOf(item.index)!.owned.find(m => m.garmentId === chosen.get(item.index))?.reasons.length"> · {{ rowOf(item.index)!.owned.find(m => m.garmentId === chosen.get(item.index))!.reasons.slice(0, 2).join('，') }}</template></p>
          </template>
          <p v-else class="rp-missing">衣柜里还没有像的</p>
          <p v-if="rowOf(item.index)?.wanted.length" class="rp-wanted">{{ wantedLabel }}里有：{{ rowOf(item.index)!.wanted.map(m => garmentName(m.garmentId)).join('、') }}</p>
        </div>
      </article>
      <p v-if="missingMain" class="rp-note">还差主要的一件，先存下来，买到了再补也行。</p>
      <div v-if="!savedId" class="rp-actions">
        <a-button type="primary" size="large" block :loading="saving" :disabled="!picked.length" @click="save"><SkinOutlined /> 存成搭配{{ picked.length ? ` · ${picked.length} 件` : '' }}</a-button>
      </div>
      <div v-else class="rp-done">
        <p>存好了，在“我的搭配”里</p>
        <div class="rp-done-actions"><a-button @click="router.push(`/outfits/${savedId}`)">打开搭配</a-button><a-button type="primary" @click="router.push({ path: '/try', query: { outfit: savedId } })">做张上身图</a-button></div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.rp h3 { margin: 0 0 10px; font-size: 15px; font-weight: 600; color: var(--ink); }
.rp-row { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
.rp-row:first-of-type { border-top: 0; padding-top: 0; }
.rp-crop { margin: 0; }
.rp-crop img { display: block; width: 72px; height: 96px; border-radius: 10px; object-fit: cover; background: var(--surface-alt); }
.rp-crop figcaption { margin-top: 4px; overflow: hidden; color: var(--muted); font-size: 11px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.rp-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rp-desc { margin: 0; color: var(--ink); font-size: 13px; }
.rp-picks { display: flex; align-items: center; gap: 8px; overflow-x: auto; padding: 2px; scrollbar-width: none; }
.rp-pick { position: relative; flex: none; width: 64px; height: 80px; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-alt); cursor: pointer; }
.rp-pick.on { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.rp-pick:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.rp-pick img { display: block; width: 100%; height: 100%; object-fit: contain; }
.rp-pick em { position: absolute; left: 4px; bottom: 4px; padding: 0 5px; border-radius: 6px; background: #111111bb; color: #fff; font-size: 10px; font-style: normal; line-height: 16px; }
.rp-held { position: absolute; right: 4px; top: 4px; padding: 0 5px; border-radius: 6px; background: var(--surface); color: var(--muted-strong); font-size: 10px; font-style: normal; line-height: 16px; }
.rp-why, .rp-wanted { margin: 0; overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.rp-missing { margin: 0; color: var(--muted-subtle); font-size: 13px; }
.rp-note { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.rp-actions { margin-top: 12px; }
.rp-done { display: grid; gap: 8px; margin-top: 12px; padding: 14px; border-radius: 14px; background: var(--surface-alt); }
.rp-done p { margin: 0; color: var(--ink); font-size: 14px; }
.rp-done-actions { display: flex; gap: 8px; }
.rp-done-actions .ant-btn { flex: 1; }
</style>
