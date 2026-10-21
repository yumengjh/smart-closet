<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { playSound } from '../../services/sound'
import { recommendApi } from '../../recommend/api'
import RecommendationStatsCard from '../../recommend/RecommendationStatsCard.vue'
import type { Statement, StyleProfileView } from '../../recommend/types'
import { STRICTNESS_NOTES, strictnessNote } from '../../recommend/format'

/** 穿搭画像 (design 8.6): every statement with its evidence, cooldowns, personal offsets, switches and search strictness.
 *  Mobile first: the master switch and a plain summary on top, everyday choices next, evidence folded, technical details last. */
const { message } = App.useApp()
const profile = ref<StyleProfileView | null>(null); const loading = ref(true); const error = ref(''); const saving = ref('')
const city = ref('')
const groups = computed(() => {
  const list = profile.value?.statements || []
  const pick = (kinds: string[]) => list.filter(s => kinds.includes(s.kind))
  return [
    { key: 'cooldown', title: '冷却中的单品', hint: '被多次“不喜欢”，暂时少推荐', items: pick(['COOLDOWN']) },
    { key: 'feedback', title: '你对搭配的反馈', hint: '点赞、不喜欢和原因', items: pick(['COMBO', 'ITEM', 'MIX', 'FEEDBACK']).concat(list.filter(s => s.kind === 'PAIR' && s.weight < 0)) },
    { key: 'taste', title: '颜色、风格与常穿组合', hint: '从保存和穿着记录里学到', items: pick(['COLOR', 'STYLE', 'MEMORY']).concat(list.filter(s => s.kind === 'PAIR' && s.weight > 0)) },
    { key: 'idle', title: '很久没穿的衣物', hint: '推荐时会适当提一提', items: pick(['IDLE']) },
  ].filter(g => g.items.length)
})
const cooldownCount = computed(() => groups.value.find(g => g.key === 'cooldown')?.items.length || 0)
const statementCount = computed(() => (profile.value?.statements.length || 0) - cooldownCount.value)
const PREVIEW = 4
const expanded = ref<Record<string, boolean>>({})
const openGroups = ref<string[]>([])
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
// 个人冷暖与正式程度：说人话，数值放在后面给想看的人。
const warmthShifted = computed(() => Math.abs(profile.value?.offsets.warmth || 0) >= 0.1)
const formalityShifted = computed(() => Math.abs(profile.value?.offsets.formality || 0) >= 0.05)
function offsetText(value: number, cap: number, shifted: boolean, more: string, less: string) {
  if (!shifted) return { label: '没有偏移', detail: '' }
  const share = cap ? Math.min(100, Math.round(Math.abs(value) / cap * 100)) : 0
  return { label: `${value > 0 ? more : less}${share >= 70 ? '不少' : '一点'}`, detail: `${Math.abs(value)} / 上限 ${cap}` }
}
const warmth = computed(() => profile.value ? offsetText(profile.value.offsets.warmth, profile.value.offsetCaps.warmth, warmthShifted.value, '偏保暖', '偏清凉') : null)
const formality = computed(() => profile.value ? offsetText(profile.value.offsets.formality, profile.value.offsetCaps.formality, formalityShifted.value, '偏正式', '偏随意') : null)
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
const styleOptions = computed(() => STYLE_DIRECTIONS.map(o => ({ ...o, disabled: preferred.value.length >= 3 && !preferred.value.includes(o.value) })))
</script>
<template>
  <div class="settings-style">
    <a-skeleton v-if="loading && !profile" active />
    <a-alert v-else-if="error" type="error" show-icon :message="error"><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <template v-else-if="profile">
      <!-- 总开关与一眼看懂的概况 -->
      <section class="settings-card style-overview">
        <div class="style-row style-row-inline">
          <div class="style-row-label"><strong>根据我的行为调整推荐</strong><small class="muted">关闭后不再参考反馈和行为，也不再上报行为事件</small></div>
          <a-switch :checked="profile.settings.profileEnabled" :loading="saving === 'enabled'" aria-label="根据我的行为调整推荐" @change="(v: boolean) => patch({ profileEnabled: v }, 'enabled')" />
        </div>
        <ul class="style-overview-stats" aria-label="画像概况">
          <li><strong>{{ statementCount }}</strong><span>条偏好依据</span></li>
          <li><strong>{{ cooldownCount }}</strong><span>件冷却中</span></li>
          <li><strong>{{ warmth?.label }}</strong><span>冷暖</span></li>
          <li><strong>{{ formality?.label }}</strong><span>正式程度</span></li>
        </ul>
        <p class="muted style-overview-note">全部来自你的反馈、保存与穿着记录，按规则统计，不调用大模型。</p>
      </section>

      <section class="settings-card">
        <h3>推荐给谁</h3>
        <p class="muted">都可以不填。只影响排序，不会因此不推荐某套；你这次明确说的风格优先。只在本地计算，不发给模型。</p>
        <div class="style-row">
          <div class="style-row-label"><strong>风格年龄感</strong><small class="muted">想要的穿着感觉，优先于年龄段</small></div>
          <a-segmented class="style-segmented" :value="profile.settings.ageFeel || ''" :options="AGE_FEELS" :disabled="saving === 'ageFeel'" @change="(v: string | number) => choose('ageFeel', v, 'ageFeel')" />
        </div>
        <div class="style-row">
          <div class="style-row-label"><strong>常穿风格</strong><small class="muted">最多选 3 个，和风格年龄感叠加</small></div>
          <a-select class="style-control" :value="preferred" mode="multiple" :options="styleOptions" allow-clear placeholder="不选" :loading="saving === 'preferredStyles'" :show-search="false" @change="choosePreferred" />
        </div>
        <div class="style-row">
          <div class="style-row-label"><strong>着装取向</strong><small class="muted">和个人资料里的性别分开；选中性或偏男性化时也会推荐男士经典搭法</small></div>
          <a-segmented class="style-segmented" :value="profile.settings.dressExpression || ''" :options="EXPRESSIONS" :disabled="saving === 'dressExpression'" @change="(v: string | number) => choose('dressExpression', v, 'dressExpression')" />
        </div>
        <div class="style-row">
          <div class="style-row-label"><strong>年龄段</strong><small class="muted">可不填；没选风格年龄感时按年龄段估计</small></div>
          <a-select class="style-control style-control-short" :value="profile.settings.ageBand ?? undefined" :options="AGE_BANDS" allow-clear placeholder="不填" :loading="saving === 'ageBand'" @change="(v: unknown) => choose('ageBand', v, 'ageBand')" />
        </div>
      </section>

      <section class="settings-card">
        <h3>推荐偏好</h3>
        <div class="style-row">
          <div class="style-row-label"><strong>配色胆量</strong><small class="muted">保守多用基础色，大胆会多试撞色</small></div>
          <a-segmented class="style-segmented" :value="profile.settings.boldness" :options="[{ value: 'CONSERVATIVE', label: '保守' }, { value: 'BALANCED', label: '适中' }, { value: 'BOLD', label: '大胆' }]" :disabled="saving === 'boldness'" @change="(v: string | number) => patch({ boldness: v }, 'boldness')" />
        </div>
        <div class="style-row style-row-inline">
          <div class="style-row-label"><strong>保留一套“新尝试”</strong><small class="muted">3 套里留 1 套平时少穿但合规的组合</small></div>
          <a-switch :checked="profile.settings.exploration" :loading="saving === 'exploration'" aria-label="保留一套新尝试" @change="(v: boolean) => patch({ exploration: v }, 'exploration')" />
        </div>
        <div class="style-row">
          <div class="style-row-label"><strong>常住城市</strong><small class="muted">可不填，用于季节判断</small></div>
          <a-input class="style-control style-control-short" v-model:value="city" :maxlength="40" placeholder="例如 杭州" @blur="city !== (profile.settings.city || '') && patch({ city }, 'city')" @press-enter="($event.target as HTMLInputElement).blur()" />
        </div>
        <div class="style-row">
          <div class="style-row-label"><strong>图片画风混搭</strong><small class="muted">写实照片和卡通插画能否放在同一套</small></div>
          <a-segmented class="style-segmented" :value="profile.settings.styleMixing" :options="[{ value: 'AUTO', label: '自动学习' }, { value: 'ALLOW', label: '总是允许' }, { value: 'FORBID', label: '总是不混' }]" :disabled="saving === 'mixing'" @change="(v: string | number) => patch({ styleMixing: v }, 'mixing')" />
        </div>
      </section>

      <section class="settings-card">
        <h3>我的穿搭画像</h3>
        <p class="muted">推荐时参考的依据。觉得哪条不像你，点“不准确”屏蔽它。</p>
        <a-empty v-if="!groups.length" class="style-empty" description="还没有足够的依据。多用几次推荐、保存或记录“今天穿了”，这里会慢慢丰富。" />
        <a-collapse v-else v-model:active-key="openGroups" ghost class="style-groups">
          <a-collapse-panel v-for="g in groups" :key="g.key">
            <template #header><span class="style-group-head"><strong>{{ g.title }}</strong><small class="muted">{{ g.hint }}</small></span></template>
            <template #extra><a-badge :count="g.items.length" :number-style="{ backgroundColor: 'var(--surface-alt)', color: 'var(--ink)', boxShadow: 'none' }" /></template>
            <ul class="style-profile-list">
              <li v-for="s in (expanded[g.key] ? g.items : g.items.slice(0, PREVIEW))" :key="s.key"><span>{{ s.text }}</span>
                <a-popconfirm :title="s.kind === 'COOLDOWN' ? '立即恢复推荐这件？' : '这条不准确，屏蔽它？'" ok-text="确定" cancel-text="取消" @confirm="block(s)">
                  <a-button size="small" :loading="saving === s.key">{{ s.kind === 'COOLDOWN' ? '立即恢复' : '不准确' }}</a-button>
                </a-popconfirm>
              </li>
            </ul>
            <a-button v-if="g.items.length > PREVIEW" type="link" size="small" class="style-more" @click="expanded[g.key] = !expanded[g.key]">{{ expanded[g.key] ? '收起' : `展开其余 ${g.items.length - PREVIEW} 条` }}</a-button>
          </a-collapse-panel>
        </a-collapse>
      </section>

      <section class="settings-card">
        <h3>个人冷暖与正式程度</h3>
        <p class="muted">来自“太热 / 太冷 / 太正式 / 太随意”的反馈，有上限并随时间减弱。</p>
        <dl class="style-offsets">
          <div><dt>冷暖</dt><dd>{{ warmth?.label }}<small v-if="warmth?.detail" class="muted">{{ warmth.detail }}</small></dd></div>
          <div><dt>正式程度</dt><dd>{{ formality?.label }}<small v-if="formality?.detail" class="muted">{{ formality.detail }}</small></dd></div>
        </dl>
        <a-popconfirm title="清空后从现在起重新统计，之前的反馈不再影响冷暖与正式程度。" ok-text="清空" cancel-text="取消" @confirm="patch({ clearOffsets: true }, 'offsets', '已清空个人偏移。')">
          <a-button class="style-action" :loading="saving === 'offsets'" :disabled="!warmthShifted && !formalityShifted">清空偏移</a-button>
        </a-popconfirm>
      </section>

      <section class="settings-card">
        <h3>语义搜索严格度</h3>
        <p class="muted">影响衣柜搜索、助手查衣柜和推荐里的描述匹配（例如“适合海边的”）。越严格越不容易给出不相关的结果，但可能漏掉一些。</p>
        <a-slider v-model:value="strictness" class="style-slider" :min="0" :max="100" :step="5" :marks="marks" :tooltip-open="false" aria-label="语义搜索严格度" @after-change="(v: number | [number, number]) => patch({ semanticStrictness: v }, 'strictness')" />
        <p class="style-profile-note"><strong>{{ strictness }}</strong> · {{ strictnessNote(strictness) }}</p>
        <a-button v-if="profile.settings.semanticStrictness !== null" class="style-action" size="small" :loading="saving === 'strictness-reset'" @click="patch({ semanticStrictness: null }, 'strictness-reset', '已恢复推荐档。')">恢复推荐档</a-button>
        <a-collapse ghost class="style-details">
          <a-collapse-panel key="levels" header="各档实测表现">
            <ul class="style-profile-slider-marks"><li v-for="l in profile.strictness.levels" :key="l.level">{{ l.level }}：{{ STRICTNESS_NOTES[l.level] }}（相似度门槛 {{ l.threshold }}）</li></ul>
          </a-collapse-panel>
        </a-collapse>
      </section>

      <a-collapse ghost class="style-details style-advanced">
        <a-collapse-panel key="stats" header="推荐效果与成本"><RecommendationStatsCard /></a-collapse-panel>
        <a-collapse-panel key="how" header="这些依据怎么来的">
          <p class="muted">“不喜欢”的影响 {{ profile.feedbackHalfLifeDays.negative }} 天减半，喜欢与常穿 {{ profile.feedbackHalfLifeDays.positive }} 天减半；之后喜欢了会自然回正。同一件衣物多次被“不喜欢”会进入冷却，之后出现喜欢、保存或穿着记录也会提前结束冷却。</p>
        </a-collapse-panel>
      </a-collapse>

      <section class="settings-card style-danger">
        <h3>清空画像</h3>
        <p class="muted">清空后画像从头统计，屏蔽项一并清除；推荐、反馈和穿着记录本身保留。</p>
        <a-popconfirm title="确定清空穿搭画像？" ok-text="清空" ok-type="danger" cancel-text="取消" @confirm="patch({ reset: true }, 'reset', '已清空，之后重新统计。')"><a-button class="style-action" danger :loading="saving === 'reset'">清空画像</a-button></a-popconfirm>
      </section>
    </template>
  </div>
</template>
<style scoped>
.settings-style { display: grid; gap: 16px; min-width: 0; }
.settings-card { min-width: 0; padding: 16px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.settings-card h3 { margin: 0 0 6px; font-size: 15px; }
.settings-card > .muted { margin: 0 0 4px; font-size: 13px; line-height: 1.7; }

/* 每项设置：桌面左右排，手机上下排、控件占满一行。 */
.style-row { display: flex; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 12px 0; border-top: 1px solid var(--line); }
.style-row:first-child { border-top: 0; padding-top: 0; }
.style-row-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.style-row-label small { font-size: 12px; line-height: 1.6; }
.style-control { width: 300px; max-width: 100%; }
.style-control-short { width: 180px; }

.style-overview .style-row { padding-bottom: 12px; }
.style-overview-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 12px 0 0; list-style: none; border-top: 1px solid var(--line); }
.style-overview-stats li { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 10px 12px; border-radius: 10px; background: var(--surface-alt); }
.style-overview-stats strong { font-size: 16px; line-height: 1.4; overflow-wrap: anywhere; }
.style-overview-stats span { font-size: 12px; color: var(--muted); }
.style-overview-note { margin: 10px 0 0 !important; font-size: 12px !important; }

.style-groups { margin: 4px -16px 0; }
.style-groups :deep(.ant-collapse-header) { align-items: center !important; }
.style-group-head { display: flex; flex-direction: column; gap: 2px; }
.style-group-head small { font-size: 12px; }
.style-groups :deep(.ant-collapse-content-box) { padding-top: 0 !important; }
.style-profile-list li > span { min-width: 0; overflow-wrap: anywhere; }
.style-profile-list li > .ant-btn, .style-profile-list :deep(li .ant-btn) { flex: none; }
.style-more { padding-left: 0; }
.style-empty { margin: 16px 0 4px; }

.style-offsets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 12px 0; }
.style-offsets > div { padding: 10px 12px; border-radius: 10px; background: var(--surface-alt); }
.style-offsets dt { font-size: 12px; color: var(--muted); }
.style-offsets dd { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin: 2px 0 0; font-size: 15px; font-weight: 600; }
.style-offsets dd small { font-size: 12px; font-weight: 400; }

.style-slider { margin: 12px 8px 28px; }
.style-profile-note { font-size: 13px; margin: 0 0 8px; line-height: 1.7; }
.style-details :deep(.ant-collapse-header) { padding-left: 0 !important; padding-right: 0 !important; color: var(--muted-strong, var(--muted)); }
.style-details :deep(.ant-collapse-content-box) { padding-left: 0 !important; padding-right: 0 !important; }
.style-advanced { padding: 0 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.style-advanced :deep(.recommend-stats) { padding: 0; border: 0; }

@media (max-width: 767px) {
  .settings-style { gap: 12px; }
  .settings-card { padding: 14px; }
  .style-groups { margin: 4px -14px 0; }
  .style-advanced { padding: 0 14px; }
  .style-row { flex-direction: column; align-items: stretch; padding: 14px 0; }
  .style-row-inline { flex-direction: row; align-items: center; }
  .style-control, .style-control-short { width: 100%; }
  .style-segmented { display: flex; width: 100%; }
  .style-segmented :deep(.ant-segmented-group) { width: 100%; }
  .style-segmented :deep(.ant-segmented-item) { flex: 1; min-width: 0; text-align: center; }
  .style-segmented :deep(.ant-segmented-item-label) { min-height: 36px; line-height: 36px; padding: 0 4px; overflow: hidden; text-overflow: ellipsis; }
  .style-overview-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .style-profile-list li { align-items: center; }
  .style-action { width: 100%; }
}
</style>
