<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { playSound } from '../../services/sound'
import { recommendApi } from '../../recommend/api'
import RecommendationStatsCard from '../../recommend/RecommendationStatsCard.vue'
import type { Statement, StyleProfileView } from '../../recommend/types'
import { STRICTNESS_NOTES, strictnessNote } from '../../recommend/format'

/** 穿搭画像 (design 8.6): every statement with its evidence, cooldowns, personal offsets, switches and search strictness. */
const { message } = App.useApp()
const profile = ref<StyleProfileView | null>(null); const loading = ref(true); const error = ref(''); const saving = ref('')
const city = ref('')
const groups = computed(() => {
  const list = profile.value?.statements || []
  const pick = (kinds: string[]) => list.filter(s => kinds.includes(s.kind))
  return [
    { title: '冷却中的单品', items: pick(['COOLDOWN']) },
    { title: '你对搭配的反馈', items: pick(['COMBO', 'ITEM', 'MIX', 'FEEDBACK']).concat(list.filter(s => s.kind === 'PAIR' && s.weight < 0)) },
    { title: '颜色、风格与常穿组合', items: pick(['COLOR', 'STYLE', 'MEMORY']).concat(list.filter(s => s.kind === 'PAIR' && s.weight > 0)) },
    { title: '很久没穿的衣物', items: pick(['IDLE']) },
  ].filter(g => g.items.length)
})
const strictness = ref(50)
async function load() {
  loading.value = true; error.value = ''
  try { profile.value = await recommendApi.profile(); city.value = profile.value.settings.city || ''; strictness.value = profile.value.strictness.level; preferred.value = profile.value.settings.preferredStyles || [] }
  catch (e) { error.value = e instanceof Error ? e.message : '穿搭画像暂时无法加载。' }
  finally { loading.value = false }
}
onMounted(load)
async function patch(body: Record<string, unknown>, key: string, done = '已保存。') {
  saving.value = key
  try { await recommendApi.updateProfile(body); await load(); playSound('tap'); message.success(done) }
  catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '没有保存成功。') }
  finally { saving.value = '' }
}
function block(s: Statement) { return s.kind === 'COOLDOWN' ? patch({ unblock: s.key }, s.key, '已恢复推荐。') : patch({ block: s.key }, s.key, '已屏蔽这一条，不再影响推荐。') }
const marks = { 0: '宽松', 25: ' ', 50: '推荐', 75: ' ', 100: '严格' }
// 推荐给谁 (design 2026-10-20): '' in the controls means unset and is saved as null.
const AGE_FEELS = [{ value: 'YOUTH', label: '青春' }, { value: 'PRIME', label: '轻熟' }, { value: 'MATURE', label: '成熟' }, { value: '', label: '不限' }]
const EXPRESSIONS = [{ value: 'FEMININE', label: '偏女性化' }, { value: 'NEUTRAL', label: '中性' }, { value: 'MASCULINE', label: '偏男性化' }, { value: '', label: '跟随性别' }]
const AGE_BANDS = [{ value: 'UNDER_18', label: '18 岁以下' }, { value: '18_24', label: '18~24 岁' }, { value: '25_34', label: '25~34 岁' }, { value: '35_44', label: '35~44 岁' }, { value: '45_54', label: '45~54 岁' }, { value: '55_PLUS', label: '55 岁以上' }]
const choose = (key: string, value: unknown, saving: string) => patch({ [key]: value || null }, saving)
// 常穿风格 (design 2026-10-21): style directions, up to three; combined with the age feel above.
const STYLE_DIRECTIONS = ['都市通勤', '高智极简', '美式休闲', '户外机能', '老钱风', '潮流运动', '工装风', '日系清新', '巴恩风', '法式', '新中式', '甜美'].map(value => ({ value, label: value }))
const preferred = ref<string[]>([])
function choosePreferred(value: unknown) {
  const next = (Array.isArray(value) ? value : []).map(String).slice(0, 3)
  preferred.value = next
  void patch({ preferredStyles: next }, 'preferredStyles')
}
</script>
<template>
  <div class="settings-style">
    <a-skeleton v-if="loading && !profile" active />
    <a-alert v-else-if="error" type="error" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <template v-else-if="profile">
      <section class="settings-card">
        <h3>我的穿搭画像</h3>
        <p class="muted">全部来自你的反馈、保存与穿着记录，按规则统计，不调用大模型。“不喜欢”的影响 {{ profile.feedbackHalfLifeDays.negative }} 天减半，喜欢与常穿 {{ profile.feedbackHalfLifeDays.positive }} 天减半；之后喜欢了会自然回正。</p>
        <a-empty v-if="!groups.length" description="还没有足够的依据。多用几次推荐、保存或记录“今天穿了”，这里会慢慢丰富。" />
        <div v-for="g in groups" :key="g.title" class="style-profile-group">
          <h4>{{ g.title }}</h4>
          <ul class="style-profile-list">
            <li v-for="s in g.items" :key="s.key"><span>{{ s.text }}</span>
              <a-popconfirm :title="s.kind === 'COOLDOWN' ? '立即恢复推荐这件？' : '这条不准确，屏蔽它？'" ok-text="确定" cancel-text="取消" @confirm="block(s)">
                <a-button size="small" :loading="saving === s.key">{{ s.kind === 'COOLDOWN' ? '立即恢复' : '不准确' }}</a-button>
              </a-popconfirm>
            </li>
          </ul>
        </div>
      </section>
      <section class="settings-card">
        <h3>个人冷暖与正式程度</h3>
        <p class="muted">来自“太热 / 太冷 / 太正式 / 太随意”的反馈，有上限并随时间减弱。</p>
        <dl class="summary-fields">
          <div><dt>冷暖</dt><dd>{{ Math.abs(profile.offsets.warmth) < 0.1 ? '没有偏移' : `${profile.offsets.warmth > 0 ? '更保暖' : '更清凉'} ${Math.abs(profile.offsets.warmth)}（上限 ${profile.offsetCaps.warmth}）` }}</dd></div>
          <div><dt>正式程度</dt><dd>{{ Math.abs(profile.offsets.formality) < 0.05 ? '没有偏移' : `${profile.offsets.formality > 0 ? '更正式' : '更随意'} ${Math.abs(profile.offsets.formality)}（上限 ${profile.offsetCaps.formality}）` }}</dd></div>
        </dl>
        <a-popconfirm title="清空后从现在起重新统计，之前的反馈不再影响冷暖与正式程度。" ok-text="清空" cancel-text="取消" @confirm="patch({ clearOffsets: true }, 'offsets', '已清空个人偏移。')">
          <a-button :loading="saving === 'offsets'" :disabled="Math.abs(profile.offsets.warmth) < 0.1 && Math.abs(profile.offsets.formality) < 0.05">清空偏移</a-button>
        </a-popconfirm>
      </section>
      <section class="settings-card">
        <h3>推荐给谁</h3>
        <p class="muted">只影响推荐的排序，不会因此不推荐某套；你这次明确说的风格优先。年龄段、风格年龄感和着装取向只用于本地计算，不发给模型。</p>
        <div class="settings-row"><div><strong>风格年龄感</strong><small class="muted">想要的穿着感觉，优先于年龄段</small></div><a-segmented :value="profile.settings.ageFeel || ''" :options="AGE_FEELS" @change="(v: string | number) => choose('ageFeel', v, 'ageFeel')" /></div>
        <div class="settings-row"><div><strong>年龄段</strong><small class="muted">可不填；没选风格年龄感时按年龄段估计</small></div><a-select :value="profile.settings.ageBand ?? undefined" :options="AGE_BANDS" allow-clear placeholder="不填" style="width: 140px" :loading="saving === 'ageBand'" @change="(v: unknown) => choose('ageBand', v, 'ageBand')" /></div>
        <div class="settings-row"><div><strong>常穿风格</strong><small class="muted">最多选 3 个；和风格年龄感叠加，比你这次说的弱</small></div><a-select :value="preferred" mode="multiple" :options="STYLE_DIRECTIONS" :max-tag-count="3" allow-clear placeholder="不选" style="min-width: 220px; max-width: 320px" :loading="saving === 'preferredStyles'" @change="choosePreferred" /></div>
        <div class="settings-row"><div><strong>着装取向</strong><small class="muted">和个人资料里的性别分开；选中性或偏男性化时也会推荐男士经典搭法</small></div><a-segmented :value="profile.settings.dressExpression || ''" :options="EXPRESSIONS" @change="(v: string | number) => choose('dressExpression', v, 'dressExpression')" /></div>
      </section>
      <section class="settings-card">
        <h3>推荐偏好</h3>
        <div class="settings-row"><div><strong>根据我的行为调整推荐</strong><small class="muted">关闭后不再参考反馈和行为，也不再上报行为事件</small></div><a-switch :checked="profile.settings.profileEnabled" :loading="saving === 'enabled'" @change="(v: boolean) => patch({ profileEnabled: v }, 'enabled')" /></div>
        <div class="settings-row"><div><strong>保留一套“新尝试”</strong><small class="muted">3 套里留 1 套平时少穿但合规的组合</small></div><a-switch :checked="profile.settings.exploration" :loading="saving === 'exploration'" @change="(v: boolean) => patch({ exploration: v }, 'exploration')" /></div>
        <div class="settings-row"><div><strong>配色胆量</strong></div><a-segmented :value="profile.settings.boldness" :options="[{ value: 'CONSERVATIVE', label: '保守' }, { value: 'BALANCED', label: '适中' }, { value: 'BOLD', label: '大胆' }]" @change="(v: string | number) => patch({ boldness: v }, 'boldness')" /></div>
        <div class="settings-row"><div><strong>图片画风混搭</strong><small class="muted">写实照片和卡通插画能否放在同一套</small></div><a-segmented :value="profile.settings.styleMixing" :options="[{ value: 'AUTO', label: '自动学习' }, { value: 'ALLOW', label: '总是允许' }, { value: 'FORBID', label: '总是不混' }]" @change="(v: string | number) => patch({ styleMixing: v }, 'mixing')" /></div>
        <div class="settings-row"><div><strong>常住城市</strong><small class="muted">可不填，用于季节判断</small></div><a-input v-model:value="city" :maxlength="40" placeholder="例如 杭州" style="max-width: 200px" @blur="city !== (profile.settings.city || '') && patch({ city }, 'city')" /></div>
      </section>
      <section class="settings-card">
        <h3>语义搜索严格度</h3>
        <p class="muted">影响衣柜搜索、助手查衣柜和推荐里的描述匹配（例如“适合海边的”）。越严格越不容易给出不相关的结果，但可能漏掉一些。</p>
        <a-slider v-model:value="strictness" :min="0" :max="100" :step="5" :marks="marks" :tooltip-open="false" aria-label="语义搜索严格度" @after-change="(v: number | [number, number]) => patch({ semanticStrictness: v }, 'strictness')" />
        <p class="style-profile-note"><strong>{{ strictness }}</strong> · {{ strictnessNote(strictness) }}<a-button v-if="profile.settings.semanticStrictness !== null" type="link" size="small" :loading="saving === 'strictness-reset'" @click="patch({ semanticStrictness: null }, 'strictness-reset', '已恢复推荐档。')">恢复推荐档</a-button></p>
        <ul class="style-profile-slider-marks"><li v-for="l in profile.strictness.levels" :key="l.level">{{ l.level }}：{{ STRICTNESS_NOTES[l.level] }}（相似度门槛 {{ l.threshold }}）</li></ul>
      </section>
      <RecommendationStatsCard />
      <section class="settings-card">
        <h3>清空画像</h3>
        <p class="muted">清空后画像从头统计，屏蔽项一并清除；推荐、反馈和穿着记录本身保留。</p>
        <a-popconfirm title="确定清空穿搭画像？" ok-text="清空" ok-type="danger" cancel-text="取消" @confirm="patch({ reset: true }, 'reset', '已清空，之后重新统计。')"><a-button danger :loading="saving === 'reset'">清空画像</a-button></a-popconfirm>
      </section>
    </template>
  </div>
</template>
<style scoped>
.settings-style { display: grid; gap: 16px; }
.settings-card { padding: 16px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.settings-card h3 { margin: 0 0 6px; font-size: 15px; }
.settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); flex-wrap: wrap; }
.settings-row > div:first-child { display: flex; flex-direction: column; }
.style-profile-note { font-size: 13px; margin: 8px 0 0; }
</style>
