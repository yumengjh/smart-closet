<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { agentRequest, type Models, type Quota } from '../../agent/api'
import MemoryDocuments from '../../components/MemoryDocuments.vue'
import AvatarPreview from '../../agent/AvatarPreview.vue'
import { avatarPreferences, applyAvatarMode, type AvatarMode } from '../../agent/avatar'
import { usingMocks } from '../../services/api'

const { message } = App.useApp()
const models = ref<Models>({ defaultModel: '', models: [], configured: false })
const model = ref('')
const quota = ref<Quota | null>(null)
const error = ref('')
const savingMode = ref(false)


async function load() {
  if (usingMocks) { error.value = '演示模式不提供真实助手设置。'; return }
  try {
    const result = await Promise.all([
      agentRequest<Models>('/models'),
      agentRequest<{ model: string; avatarMode: string }>('/preferences'),
      agentRequest<Quota>('/quota'),
    ])
    applyAvatarMode(result[1].avatarMode)
    models.value = result[0]; model.value = result[1].model; quota.value = result[2]
  } catch (e) { error.value = e instanceof Error ? e.message : '助手设置无法加载。' }
}

onMounted(() => { void load() })

async function saveModel() {
  try { await agentRequest('/preferences', 'PUT', { model: model.value }); message.success('个人默认模型已保存。') }
  catch (e) { message.error(String(e)) }
}

async function saveMode(value: AvatarMode) {
  savingMode.value = true
  try {
    const p = await agentRequest<{ avatarMode: string }>('/preferences', 'PUT', { avatarMode: value })
    applyAvatarMode(p.avatarMode); message.success('助手动效已保存。')
  } catch (e) { message.error(String(e)) } finally { savingMode.value = false }
}

</script>

<template>
  <div class="settings-section-content">
    <a-alert v-if="error" type="error" :message="error" show-icon />

    <!-- 模型 -->
    <section class="settings-group">
      <header class="settings-group-head settings-group-head-row">
        <div>
          <h3>默认模型与对话额度</h3>
          <p>从平台开放的模型中选择。当前对话还可以单独切换模型。</p>
        </div>
        <RouterLink class="settings-group-link" to="/help?article=03-assistant">查看助手说明 ↗</RouterLink>
      </header>
      <div class="agent-setting-model">
        <a-select v-model:value="model" aria-label="个人助手默认模型" :options="models.models.map(value => ({ value, label: value }))" />
        <a-button :disabled="!model" @click="saveModel">保存模型</a-button>
      </div>
      <p v-if="quota" class="agent-setting-quota">今天已提交 <strong>{{ quota.used }}</strong> / {{ quota.limit }} 条助手消息</p>
      <p class="settings-hint">助手消息与图像任务分开统计，每天按北京时间重置。内部工具调用不另计消息次数。</p>
    </section>

    <!-- 蓝色小伙伴 -->
    <section class="settings-group">
      <header class="settings-group-head">
        <h3>角色动效</h3>
        <p>基础动画和空闲玩法不消耗模型 token。个性动效让助手每轮最多选择一次表达，只增加少量提示与控制信息，不另发模型请求。</p>
      </header>
      <a-segmented
        class="agent-mode-segmented"
        :value="avatarPreferences.mode"
        aria-label="助手动效模式"
        :disabled="savingMode || !!error"
        :options="[{value:'static',label:'静态'},{value:'basic',label:'基础动效'},{value:'personal',label:'Agent 个性动效'}]"
        @change="saveMode"
      />
      <p class="settings-hint">
        {{ avatarPreferences.mode === 'static' ? '安静圆球，任务状态仍有文字提示。' : avatarPreferences.mode === 'basic' ? '任务和拖拽跟随真实状态；收起后每隔 10–20 秒随机玩一个动作。' : '真实任务优先，聊天温和表达；收起后每隔 10–20 秒随机玩一个动作。' }}
        设置随账号保存，系统减少动态效果优先。
      </p>
      <div class="settings-group-sub">
        <h4>动作预览</h4>
        <AvatarPreview />
      </div>
    </section>

    <MemoryDocuments />
  </div>
</template>
