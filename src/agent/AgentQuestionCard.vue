<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CheckOutlined } from '@ant-design/icons-vue'
import { agentRequest, type Proposal } from './api'
import { pageContext } from './bridge'
import { answerText } from './question'
import { sendToAssistant } from './assistantEvents'
import { playSound } from '../services/sound'

/**
 * 助手提问卡：the assistant asks the user to pick. Answering marks the question answered on the server and sends the
 * answer as the user's next chat message, so the conversation keeps the answer in plain text.
 */
const props = defineProps<{ proposal: Proposal }>()
const route = useRoute()
const payload = computed(() => props.proposal.payload)
const options = computed(() => (payload.value.options || []).filter(o => typeof o?.label === 'string' && o.label.trim()))
const multiple = computed(() => Boolean(payload.value.multiple))
const picked = ref<number[]>([]); const custom = ref(''); const answer = ref(''); const sending = ref(false)
const answered = computed(() => props.proposal.consumed || Boolean(answer.value))
const locked = computed(() => answered.value || sending.value)
const titleId = `agent-question-${props.proposal.id}`

function choose(index: number) {
  if (locked.value) return
  playSound('pop')
  if (!multiple.value) { void submit([index], ''); return }
  picked.value = picked.value.includes(index) ? picked.value.filter(i => i !== index) : [...picked.value, index]
}
async function submit(indexes: number[], typed: string) {
  const text = answerText(options.value, indexes, typed, multiple.value)
  if (!text || locked.value) return
  sending.value = true; picked.value = typed.trim() ? [] : indexes
  // Marking it answered only keeps the card from being answered twice; the chat message is what matters.
  try { await agentRequest(`/proposals/${props.proposal.id}/accept`, 'POST', { context: pageContext(route.path), current: false }) }
  catch (e) { console.warn('助手提问未能标记为已回答', e) }
  answer.value = text; sending.value = false
  sendToAssistant(text)
}
// Enter while an input method is composing only commits the characters (keyCode 229 covers older Safari).
function sendCustom(event?: KeyboardEvent) { if (event?.isComposing || event?.keyCode === 229) return; event?.preventDefault(); void submit([], custom.value) }
</script>
<template>
  <section class="agent-question" :class="{ answered }" :aria-labelledby="titleId">
    <p :id="titleId" class="agent-question-title">{{ payload.question || '请选择' }}<small v-if="multiple && !answered">可多选</small></p>
    <div class="agent-question-options" role="group" :aria-labelledby="titleId">
      <a-button v-for="(option, index) in options" :key="index" class="agent-question-option" :class="{ picked: picked.includes(index) }" :disabled="locked" :aria-pressed="multiple ? picked.includes(index) : undefined" data-sound="off" @click="choose(index)">
        <span class="agent-question-label"><CheckOutlined v-if="picked.includes(index)" />{{ option.label }}</span><small v-if="option.description">{{ option.description }}</small>
      </a-button>
    </div>
    <template v-if="!answered">
      <a-button v-if="multiple" class="agent-question-confirm" type="primary" size="small" :disabled="!picked.length || sending" :loading="sending && !custom.trim()" @click="submit(picked, '')">确定{{ picked.length ? `（${picked.length}）` : '' }}</a-button>
      <div v-if="payload.allowCustom" class="agent-question-custom">
        <a-input v-model:value="custom" size="small" :maxlength="200" :placeholder="payload.placeholder || '都不合适？自己说…'" aria-label="自己说" :disabled="sending" @keydown.enter.exact="sendCustom" />
        <a-button size="small" :disabled="!custom.trim() || sending" :loading="sending && !!custom.trim()" @click="sendCustom()">发送</a-button>
      </div>
    </template>
    <small v-else class="agent-question-done"><CheckOutlined />已回答<template v-if="answer">：{{ answer }}</template></small>
  </section>
</template>
