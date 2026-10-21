<script setup lang="ts">
import { ref } from 'vue'
import { App } from 'ant-design-vue'
import { playSound } from '../services/sound'
import { recommendApi } from '../recommend/api'
import PresetPicker from './PresetPicker.vue'

/**
 * 新用户引导（预设衣物库设计 6.1）：① 推荐给谁 ② 选择常见单品 ③ 完成。每一步都能跳过；关闭后本机不再自动弹出。
 * 选择直接写进穿搭画像的“风格年龄感”和“常穿风格”。
 */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ done: [imported: number] }>()
const { message } = App.useApp()
const AGE_FEELS = [{ value: 'YOUTH', label: '青春' }, { value: 'PRIME', label: '轻熟' }, { value: 'MATURE', label: '成熟' }, { value: '', label: '不限' }]
const STYLE_OPTIONS = ['都市通勤', '高智极简', '美式休闲', '户外机能', '老钱风', '潮流运动', '工装风', '日系清新', '巴恩风', '法式', '新中式', '甜美'].map(value => ({ value, label: value }))
const SEX_OPTIONS = [{ value: 'ALL', label: '不限' }, { value: 'FEMALE', label: '女' }, { value: 'MALE', label: '男' }]

const step = ref(0); const ageFeel = ref(''); const styles = ref<string[]>([]); const sex = ref<'ALL' | 'FEMALE' | 'MALE'>('ALL')
const saving = ref(false); const imported = ref(0)
const picker = ref<InstanceType<typeof PresetPicker> | null>(null)

async function saveTaste() {
  saving.value = true
  try {
    if (ageFeel.value || styles.value.length) await recommendApi.updateProfile({ ageFeel: ageFeel.value || null, preferredStyles: styles.value.slice(0, 3) })
    playSound('tap'); step.value = 1
  } catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '没有保存成功，可以先跳过。') }
  finally { saving.value = false }
}
async function addChosen() { if (picker.value?.chosenCount) await picker.value.submit(); step.value = 2 }
function onImported(count: number) { imported.value += count }
function finish() { open.value = false; emit('done', imported.value) }
</script>

<template>
  <a-modal v-model:open="open" title="开始使用鱼搭" :width="860" :footer="null" :mask-closable="false" destroy-on-close @cancel="finish">
    <a-steps :current="step" size="small" class="onboarding-steps" :items="[{ title: '推荐给谁' }, { title: '常见单品' }, { title: '完成' }]" />
    <section v-if="step === 0" class="onboarding-step">
      <p class="muted">告诉鱼搭你喜欢的感觉，推荐会更合适。都可以不选，之后在“我的 → 穿搭画像”里也能改。</p>
      <div class="settings-row"><div><strong>风格年龄感</strong><small class="muted">想要的穿着感觉，不是实际年龄</small></div><a-segmented v-model:value="ageFeel" :options="AGE_FEELS" /></div>
      <div class="settings-row"><div><strong>常穿风格</strong><small class="muted">最多 3 个</small></div><a-select v-model:value="styles" mode="multiple" :options="STYLE_OPTIONS" :max-tag-count="3" allow-clear placeholder="不选" style="min-width: 240px" @change="(v: unknown) => { styles = (v as string[]).slice(0, 3) }" /></div>
      <footer class="onboarding-actions"><a-button @click="step = 1">跳过</a-button><a-button type="primary" :loading="saving" @click="saveTaste">下一步</a-button></footer>
    </section>
    <section v-else-if="step === 1" class="onboarding-step">
      <p class="muted">衣柜还是空的？勾选你有类似的单品，先用示意图搭起来，之后可以换成自己的照片。</p>
      <div class="settings-row"><div><strong>看哪类单品</strong></div><a-segmented v-model:value="sex" :options="SEX_OPTIONS" /></div>
      <PresetPicker ref="picker" compact :sex="sex" :styles="styles" @imported="onImported" />
      <footer class="onboarding-actions"><a-button @click="step = 2">跳过</a-button><a-button type="primary" @click="addChosen">{{ picker?.chosenCount ? `加入 ${picker.chosenCount} 件并继续` : '下一步' }}</a-button></footer>
    </section>
    <section v-else class="onboarding-step">
      <a-result status="success" :title="imported ? `已加入 ${imported} 件常见单品` : '准备好了'" :sub-title="imported ? '它们标着“预设”，是示意图；在衣物详情里点“换成我的照片”就能换成自己的。' : '可以从“添加衣物”上传第一件，也可以随时在衣柜页“从常见单品添加”。'">
        <template #extra><a-button type="primary" @click="finish">开始使用</a-button></template>
      </a-result>
    </section>
  </a-modal>
</template>

<style scoped>
.onboarding-steps { margin-bottom: 16px; }
.onboarding-step { display: grid; gap: 12px; }
.settings-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; }
.settings-row > div:first-child { display: grid; gap: 2px; }
.onboarding-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
</style>
