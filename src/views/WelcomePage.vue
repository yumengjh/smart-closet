<script setup lang="ts">
// 首次体验（ToC 改版 P3，#239；设计（二）T12）：注册后四步，每步都能跳过。
// ① 你是（只写个人资料的性别，影响“男性 × 女款”底线）② 喜欢哪种感觉（常穿风格，最多 3 个）③ 先挑几件你有的（常见单品，
// 只导入勾选的，默认不勾）④ 用这些衣服搭出第一套。年龄、身材不在这里问；不设时推荐与改动前一致。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { App as AntApp } from 'ant-design-vue'
import { ArrowLeftOutlined, CameraOutlined, CheckOutlined } from '@ant-design/icons-vue'
import { recommendApi } from '../recommend/api'
import type { RecommendedOutfit } from '../recommend/types'
import { platformRequest, type Profile } from '../services/platform'
import { presetApi, presetName, presetGroup, PRESET_GROUPS, type PresetItem } from '../services/presets'
import { thumbUrl } from '../services/urls'
import { useClosetStore } from '../stores/closet'
import { playSound } from '../services/sound'
import { celebrate } from '../services/celebrate'
import OutfitCollage from '../today/OutfitCollage.vue'
import { MAX_STYLES, STYLE_DIRECTIONS, markOnboarded, rankPresets, styleCover, toggleStyle, type Sex } from '../onboarding/welcome'

const router = useRouter(); const closet = useClosetStore(); const { message } = AntApp.useApp()
const name = computed(() => closet.user?.displayName || closet.user?.username || '')
const step = ref(0); const STEPS = 4
const sex = ref<Sex | null>(null); const styles = ref<string[]>([])
const presets = ref<PresetItem[]>([]); const presetsLoaded = ref(false)
const picked = ref<Set<string>>(new Set()); const group = ref('全部'); const importing = ref(false); const imported = ref(0)
const outfit = ref<RecommendedOutfit | null>(null); const revealing = ref(false)

onMounted(async () => {
  try { presets.value = await presetApi.list() } catch { presets.value = [] }
  finally { presetsLoaded.value = true }
})

const SEXES: { value: Sex; label: string; hint: string }[] = [{ value: 'FEMALE', label: '女生', hint: '推荐里不会出现男款' }, { value: 'MALE', label: '男生', hint: '推荐里不会出现女款' }, { value: '', label: '不想说', hint: '都可能推荐' }]
async function saveSex(value: Sex) {
  if (!value) return
  try { const current = await platformRequest<Profile>('/api/me/wearer-profile'); await platformRequest('/api/me/wearer-profile', 'PUT', { ...current, sex: value }) }
  catch { message.warning('性别暂时没保存上，可以稍后在“我的 → 我的形象”里改。') }
}
function chooseSex(value: Sex) { sex.value = value; playSound('tap'); void saveSex(value); step.value = 1 }

const covers = computed(() => Object.fromEntries(STYLE_DIRECTIONS.map(s => [s, styleCover(presets.value, s, sex.value || '')])))
function pickStyle(s: string) {
  const next = toggleStyle(styles.value, s)
  if (next.length === styles.value.length && !styles.value.includes(s)) { message.info(`最多选 ${MAX_STYLES} 个`); return }
  styles.value = next; playSound('tick')
}
async function saveStyles() {
  if (styles.value.length) recommendApi.updateProfile({ preferredStyles: styles.value }).catch(() => message.warning('风格暂时没保存上，可以稍后在“我的 → 我的风格”里改。'))
  step.value = 2
}

const ranked = computed(() => rankPresets(presets.value, sex.value || '', styles.value))
const groups = computed(() => { const present = new Set(ranked.value.map(item => presetGroup(item))); return ['全部', ...PRESET_GROUPS.filter(g => present.has(g))] })
const shown = computed(() => group.value === '全部' ? ranked.value : ranked.value.filter(item => presetGroup(item) === group.value))
function togglePreset(item: PresetItem) {
  if (item.alreadyImported) return
  const next = new Set(picked.value); if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
  picked.value = next; playSound('tick')
}
async function importPicked() {
  if (!picked.value.size) { await reveal(); return }
  importing.value = true
  try { const result = await presetApi.importInto([...picked.value].slice(0, 100)); imported.value = result.garmentIds.length; playSound('success') }
  catch (e) { message.error(e instanceof Error ? e.message : '没有收进衣柜，可以再试一次。'); importing.value = false; return }
  importing.value = false
  await reveal()
}
async function reveal() {
  step.value = 3; revealing.value = true
  try { outfit.value = (await recommendApi.recommend({ occasion: 'DAILY', requiredGarmentIds: [], count: 1 })).outfits[0] ?? null }
  catch { outfit.value = null }
  finally { revealing.value = false }
  if (outfit.value) void celebrate('milestone')
}
function finish(to = '/today') { if (closet.user) markOnboarded(closet.user.username); void router.replace(to) }
function back() { if (step.value > 0 && step.value < 3) step.value-- }
</script>

<template>
  <div class="ob">
    <header class="ob-top">
      <a-button v-if="step > 0 && step < 3" type="text" class="ob-icon" aria-label="上一步" @click="back"><ArrowLeftOutlined /></a-button>
      <span v-else class="ob-icon" />
      <div class="ob-bars" aria-hidden="true"><i v-for="n in STEPS" :key="n" :class="{ on: n <= step + 1 }" /></div>
      <a-button v-if="step < 3" type="text" class="ob-skip" @click="finish()">跳过</a-button>
      <span v-else class="ob-icon" />
    </header>

    <Transition name="ob-step" mode="out-in">
      <section v-if="step === 0" key="sex" class="ob-body">
        <h1>{{ name ? `你好，${name}` : '你好' }}</h1>
        <p class="ob-lead">先认识一下：你是？</p>
        <div class="ob-sexes" role="radiogroup" aria-label="你的性别">
          <a-button v-for="o in SEXES" :key="o.value" class="ob-sex" :class="{ on: sex === o.value }" role="radio" :aria-checked="sex === o.value" @click="chooseSex(o.value)">
            <b>{{ o.label }}</b><small>{{ o.hint }}</small>
          </a-button>
        </div>
      </section>

      <section v-else-if="step === 1" key="styles" class="ob-body">
        <h1>喜欢哪种感觉？</h1>
        <p class="ob-lead">选 1～3 个，鱼搭照着这个方向给你搭</p>
        <div class="ob-styles">
          <button v-for="s in STYLE_DIRECTIONS" :key="s" type="button" class="ob-style" :class="{ on: styles.includes(s) }" :aria-pressed="styles.includes(s)" @click="pickStyle(s)">
            <span class="ob-style-art">
              <img v-for="(item, i) in covers[s]" :key="item.id" :src="thumbUrl(item.displayUrl, 240)" alt="" loading="lazy" :style="{ '--i': i, '--n': covers[s].length }" />
              <em v-if="!covers[s].length" class="ob-style-word" aria-hidden="true">{{ s }}</em>
            </span>
            <b>{{ s }}</b>
            <span class="ob-check"><CheckOutlined /></span>
          </button>
        </div>
      </section>

      <section v-else-if="step === 2" key="presets" class="ob-body">
        <h1>先挑几件你有的</h1>
        <p class="ob-lead">有类似的就点一下，不用拍照。以后可以换成自己的照片</p>
        <div v-if="groups.length > 2" class="ob-groups">
          <a-button v-for="g in groups" :key="g" class="ob-group" :class="{ on: group === g }" @click="group = g">{{ g }}</a-button>
        </div>
        <a-skeleton v-if="!presetsLoaded" active />
        <p v-else-if="!ranked.length" class="ob-quiet">常见单品暂时没有内容，可以直接拍一件。</p>
        <div v-else class="ob-presets">
          <button v-for="item in shown" :key="item.id" type="button" class="ob-preset" :class="{ on: picked.has(item.id), done: item.alreadyImported }" :aria-pressed="picked.has(item.id)" :disabled="item.alreadyImported" @click="togglePreset(item)">
            <img :src="thumbUrl(item.displayUrl, 320)" :alt="presetName(item)" loading="lazy" />
            <span class="ob-check"><CheckOutlined /></span>
            <small>{{ item.alreadyImported ? '已在衣柜' : presetName(item) }}</small>
          </button>
        </div>
      </section>

      <section v-else key="reveal" class="ob-body ob-reveal">
        <template v-if="revealing"><a-skeleton active :paragraph="{ rows: 6 }" /></template>
        <template v-else-if="outfit">
          <span class="ob-tag">{{ imported ? `用你挑的 ${imported} 件搭的` : '用你衣柜里的衣服搭的' }}</span>
          <h1>今天可以这样穿</h1>
          <div class="ob-outfit">
            <div class="ob-outfit-art"><OutfitCollage :pieces="outfit.garments" :title="outfit.name" /></div>
            <b>{{ outfit.name }}</b><small>{{ outfit.highlights[0] || outfit.garments.map(g => g.name).join(' · ') }}</small>
          </div>
        </template>
        <template v-else>
          <h1>{{ imported ? `已收进 ${imported} 件` : '准备好了' }}</h1>
          <p class="ob-lead">再多放几件衣服，鱼搭就能每天给你搭一套。</p>
        </template>
      </section>
    </Transition>

    <footer class="ob-foot">
      <template v-if="step === 1"><a-button type="primary" size="large" block @click="saveStyles">{{ styles.length ? `下一步 · 已选 ${styles.length} 个` : '先不选，下一步' }}</a-button></template>
      <template v-else-if="step === 2">
        <a-button type="primary" size="large" block :loading="importing" @click="importPicked">{{ picked.size ? `收进衣柜 · ${picked.size} 件` : '先不挑，下一步' }}</a-button>
        <a-button type="text" @click="finish('/add')"><CameraOutlined /> 直接拍一件</a-button>
      </template>
      <template v-else-if="step === 3 && !revealing">
        <a-button type="primary" size="large" block @click="finish()">开始用鱼搭</a-button>
        <a-button type="text" @click="finish('/add')"><CameraOutlined /> 拍下自己的衣服，搭配会更像你</a-button>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.ob { display: flex; flex-direction: column; min-height: 100dvh; max-width: 760px; margin: 0 auto; padding: 12px 20px calc(16px + env(safe-area-inset-bottom)); background: var(--paper); }
.ob-top { display: flex; align-items: center; gap: 10px; height: 48px; }
.ob-icon { flex: none; width: 48px; }
.ob-icon.ant-btn { height: 40px; }
.ob-skip.ant-btn { flex: none; width: 48px; padding: 0; color: var(--muted); }
.ob-bars { display: flex; flex: 1; gap: 6px; }
.ob-bars i { flex: 1; height: 4px; border-radius: 2px; background: var(--line); transition: background .3s ease; }
.ob-bars i.on { background: var(--ink); }
.ob-body { flex: 1; padding: 18px 0 8px; }
.ob-body h1 { margin: 0; font-size: 28px; font-weight: 700; line-height: 1.25; letter-spacing: -.01em; }
.ob-lead { margin: 6px 0 22px; color: var(--muted); font-size: 15px; }
.ob-quiet { color: var(--muted); }
.ob-sexes { display: grid; gap: 12px; margin-top: 8px; }
.ob-sex.ant-btn { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; height: 76px; padding: 0 20px; border: 0; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); text-align: left; }
.ob-sex.ant-btn b { font-size: 18px; font-weight: 600; }
.ob-sex.ant-btn small { color: var(--muted); font-size: 13px; }
html .ob-sex.ant-btn:hover, .ob-sex.on.ant-btn { box-shadow: 0 0 0 2px var(--ink); background: var(--surface); color: var(--ink); }
.ob-styles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ob-style { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 8px 8px 12px; border: 0; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); color: var(--ink); text-align: left; cursor: pointer; font: inherit; transition: box-shadow .15s ease, transform .2s var(--spring); }
.ob-style:active { transform: scale(.97); }
.ob-style.on { box-shadow: 0 0 0 2px var(--ink); }
.ob-style b { padding: 0 4px; font-size: 15px; font-weight: 600; }
.ob-style-art { position: relative; display: block; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 12px; background: var(--surface-alt); }
.ob-style-art img { position: absolute; top: 12%; width: 46%; height: 76%; object-fit: contain; filter: drop-shadow(0 6px 10px #0000001a); left: calc(50% - 23% + (var(--i) - (var(--n) - 1) / 2) * 30%); }
.ob-style-word { position: absolute; inset: 0; display: grid; place-items: center; font-size: 26px; font-style: normal; font-weight: 700; letter-spacing: .08em; color: color-mix(in srgb, var(--ink) 14%, transparent); }
.ob-check { position: absolute; top: 14px; right: 14px; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: transparent; background: var(--surface); box-shadow: 0 0 0 1.5px var(--line); font-size: 12px; transition: all .2s var(--spring); }
.on > .ob-check { color: var(--action-fg); background: var(--action-bg); box-shadow: none; transform: scale(1.08); }
.ob-groups { display: flex; gap: 8px; margin: -8px -20px 14px; padding: 2px 20px; overflow-x: auto; scrollbar-width: none; }
.ob-groups::-webkit-scrollbar { display: none; }
.ob-group.ant-btn { flex: none; height: 34px; padding: 0 16px; border: 0; border-radius: 999px; color: var(--muted-strong); background: var(--surface-alt); }
.ob-group.on.ant-btn, html .ob-group.on.ant-btn:hover { color: var(--action-fg); background: var(--action-bg); }
.ob-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ob-preset { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
.ob-preset img { width: 100%; aspect-ratio: 3 / 4; object-fit: contain; padding: 8px; border-radius: 12px; background: var(--surface-alt); transition: box-shadow .15s ease; }
.ob-preset.on img { box-shadow: 0 0 0 2px var(--ink); }
.ob-preset .ob-check { top: 6px; right: 6px; width: 22px; height: 22px; }
.ob-preset small { overflow: hidden; padding: 0 2px; font-size: 12px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.ob-preset.done { cursor: default; opacity: .55; }
.ob-reveal { display: flex; flex-direction: column; align-items: center; text-align: center; }
.ob-tag { margin-bottom: 8px; padding: 4px 12px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); font-size: 13px; }
.ob-outfit { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; max-width: 420px; margin-top: 18px; padding: 10px 10px 16px; border-radius: 20px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); animation: ob-rise .6s var(--ease-out); }
.ob-outfit-art { width: 100%; aspect-ratio: 1; border-radius: 14px; background: var(--surface-alt); }
.ob-outfit b { margin-top: 8px; font-size: 18px; font-weight: 600; }
.ob-outfit small { color: var(--muted); font-size: 13px; }
@keyframes ob-rise { from { opacity: 0; transform: translateY(16px) scale(.97); } }
.ob-foot { position: sticky; bottom: 0; display: grid; gap: 6px; padding: 14px 0 0; background: linear-gradient(transparent, var(--paper) 24%); }
.ob-foot .ant-btn-lg { height: 52px; font-size: 16px; }
.ob-step-enter-active, .ob-step-leave-active { transition: opacity .2s ease, transform .3s var(--ease-out); }
.ob-step-enter-from { opacity: 0; transform: translateX(24px); }
.ob-step-leave-to { opacity: 0; transform: translateX(-24px); }
@media (min-width: 768px) {
  .ob { padding-top: 32px; }
  .ob-body h1 { font-size: 32px; }
  .ob-sexes { grid-template-columns: repeat(3, 1fr); }
  .ob-styles { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ob-presets { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .ob-foot { justify-items: center; }
  .ob-foot .ant-btn-block { max-width: 420px; }
}
@media (prefers-reduced-motion: reduce) { .ob-step-enter-active, .ob-step-leave-active, .ob-outfit, .ob-style, .ob-check, .ob-bars i { transition: none; animation: none; } }
</style>
