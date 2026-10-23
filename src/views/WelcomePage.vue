<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { App as AntApp } from 'ant-design-vue'
import AuthShell from '../components/AuthShell.vue'
import { recommendApi } from '../recommend/api'
import { platformRequest, type Profile } from '../services/platform'
import { useClosetStore } from '../stores/closet'
import type { AgeBand, DressExpression } from '../recommend/types'

/**
 * 注册后问询 (issue #82)：四步，每步都能跳过。答案只写进已有设置——“推荐给谁”（着装取向、年龄段、常穿风格）
 * 存 /api/style-profile，性别与身高体重存个人资料 /api/me/wearer-profile；不新增字段，不发给模型。
 * 之后进入衣柜：空衣柜会先弹“从常见单品里挑几件”，再播新手指引。
 */
const router = useRouter(); const closet = useClosetStore(); const { message } = AntApp.useApp()
const step = ref(0), saving = ref(false)
const sex = ref<'FEMALE' | 'MALE' | ''>(''), expression = ref<DressExpression | ''>('')
const ageBand = ref<AgeBand | ''>(''), styles = ref<string[]>([])
const heightCm = ref<number | null>(null), weightKg = ref<number | null>(null), bodyShape = ref('')
const SEXES = [{ value: 'FEMALE', label: '女' }, { value: 'MALE', label: '男' }, { value: '', label: '不说' }]
const EXPRESSIONS = [{ value: 'FEMININE', label: '偏女性化' }, { value: 'NEUTRAL', label: '中性' }, { value: 'MASCULINE', label: '偏男性化' }, { value: '', label: '跟随性别' }]
const AGE_BANDS: { value: AgeBand; label: string }[] = [{ value: 'UNDER_18', label: '18 岁以下' }, { value: '18_24', label: '18~24 岁' }, { value: '25_34', label: '25~34 岁' }, { value: '35_44', label: '35~44 岁' }, { value: '45_54', label: '45~54 岁' }, { value: '55_PLUS', label: '55 岁以上' }]
// Same list and limit as 设置 → 推荐偏好 → 常穿风格.
const STYLE_DIRECTIONS = ['都市通勤', '高智极简', '美式休闲', '户外机能', '老钱风', '潮流运动', '工装风', '日系清新', '巴恩风', '法式', '新中式', '甜美']
const STEPS = [
  { title: '推荐给谁穿？', intro: '决定推荐男装还是女装、偏什么感觉。之后可以在“我的 → 推荐偏好”里改。' },
  { title: '你的年龄段', intro: '只存档位，不存生日。用来让推荐更贴合你，不会写进推荐理由。' },
  { title: '平时常穿什么风格？', intro: '最多选 3 个，没说风格时推荐会稍微往这边靠。' },
  { title: '身高和身材（可选）', intro: '只在生成 OOTD 试穿模特时使用，不填会用示意默认值。' },
]
const name = computed(() => closet.user?.displayName || closet.user?.username || '')
function toggleStyle(value: string) {
  if (styles.value.includes(value)) styles.value = styles.value.filter(s => s !== value)
  else if (styles.value.length < 3) styles.value = [...styles.value, value]
}
async function save() {
  const failures: string[] = []
  const settings: Record<string, unknown> = {}
  if (expression.value) settings.dressExpression = expression.value
  if (ageBand.value) settings.ageBand = ageBand.value
  if (styles.value.length) settings.preferredStyles = styles.value
  if (Object.keys(settings).length) try { await recommendApi.updateProfile(settings) } catch { failures.push('推荐偏好') }
  if (sex.value || heightCm.value || weightKg.value || bodyShape.value.trim()) try {
    const current = await platformRequest<Profile>('/api/me/wearer-profile')
    await platformRequest('/api/me/wearer-profile', 'PUT', { ...current, sex: sex.value || current.sex, heightCm: heightCm.value ?? current.heightCm, weightKg: weightKg.value ?? current.weightKg, bodyShape: bodyShape.value.trim() || current.bodyShape })
  } catch { failures.push('个人资料') }
  return failures
}
async function finish(skipAll = false) {
  if (saving.value) return
  saving.value = true
  try {
    const failures = skipAll ? [] : await save()
    if (failures.length) message.warning(`${failures.join('、')}暂时没保存上，可以稍后在“我的”里再填。`)
    await router.replace('/wardrobe')
  } finally { saving.value = false }
}
function next() { if (step.value < STEPS.length - 1) step.value++; else void finish() }
</script>

<template>
  <AuthShell compact-art :eyebrow="`${name ? name + '，' : ''}欢迎来到鱼搭 · ${step + 1} / ${STEPS.length}`" :title="STEPS[step].title" :intro="STEPS[step].intro">
    <template #top><div class="welcome-progress" aria-hidden="true"><span v-for="(_, i) in STEPS" :key="i" :class="{ done: i <= step }"></span></div></template>
    <div class="welcome-body">
      <template v-if="step === 0">
        <p class="welcome-label">你的性别</p>
        <a-segmented v-model:value="sex" block size="large" :options="SEXES" />
        <p class="welcome-label">穿衣偏向</p>
        <div class="welcome-chips"><a-button v-for="o in EXPRESSIONS" :key="o.value" shape="round" size="large" :type="expression === o.value ? 'primary' : 'default'" :aria-pressed="expression === o.value" @click="expression = o.value as DressExpression | ''">{{ o.label }}</a-button></div>
      </template>
      <div v-else-if="step === 1" class="welcome-chips"><a-button v-for="o in AGE_BANDS" :key="o.value" shape="round" size="large" :type="ageBand === o.value ? 'primary' : 'default'" :aria-pressed="ageBand === o.value" @click="ageBand = ageBand === o.value ? '' : o.value">{{ o.label }}</a-button></div>
      <template v-else-if="step === 2">
        <div class="welcome-chips"><a-button v-for="s in STYLE_DIRECTIONS" :key="s" shape="round" size="large" :type="styles.includes(s) ? 'primary' : 'default'" :aria-pressed="styles.includes(s)" :disabled="styles.length >= 3 && !styles.includes(s)" @click="toggleStyle(s)">{{ s }}</a-button></div>
        <p class="welcome-count">已选 {{ styles.length }} / 3</p>
      </template>
      <template v-else>
        <div class="welcome-grid">
          <label>身高（cm）<a-input-number v-model:value="heightCm" size="large" :min="1" :max="300" placeholder="不填" /></label>
          <label>体重（kg）<a-input-number v-model:value="weightKg" size="large" :min="1" :max="600" placeholder="不填" /></label>
        </div>
        <label class="welcome-shape">身材特点<a-input v-model:value="bodyShape" size="large" :maxlength="500" placeholder="例如：肩较宽、梨形身材" /></label>
      </template>
    </div>
    <div class="auth-form">
      <a-button type="primary" size="large" block class="auth-submit" :loading="saving" @click="next">{{ step < STEPS.length - 1 ? '下一步' : '完成，进入衣柜' }}</a-button>
      <a-button v-if="step > 0" size="large" block :disabled="saving" @click="step--">上一步</a-button>
    </div>
    <template #footer><a-button type="link" :disabled="saving" @click="finish(true)">跳过，直接进入衣柜</a-button></template>
  </AuthShell>
</template>

<style scoped>
.welcome-progress { display: flex; gap: 6px; margin-bottom: 20px; }
.welcome-progress span { flex: 1; height: 4px; border-radius: 4px; background: var(--line); transition: background .3s; }
.welcome-progress span.done { background: var(--accent); }
.welcome-body { margin-top: 24px; }
.welcome-label { margin: 16px 0 8px; color: var(--muted-strong); font-size: 13px; }
.welcome-label:first-child { margin-top: 0; }
.welcome-chips { display: flex; flex-wrap: wrap; gap: 10px; }
.welcome-count { margin: 10px 0 0; color: var(--muted-subtle); font-size: 12px; }
.welcome-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.welcome-grid label, .welcome-shape { display: grid; gap: 6px; color: var(--muted-strong); font-size: 13px; }
.welcome-grid :deep(.ant-input-number) { width: 100%; }
.welcome-shape { margin-top: 12px; }
@media (prefers-reduced-motion: reduce) { .welcome-progress span { transition: none; } }
</style>
