<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { useRouter, useRoute } from 'vue-router'
import OutfitThumbnail from '../components/OutfitThumbnail.vue'
import { useClosetStore } from '../stores/closet'
import { agentRequest, type Proposal } from './api'
import { canvasBridge, candidateScene, editedScene, pageContext } from './bridge'
import type { OutfitScene } from '../domain/outfit'
const props = defineProps<{ proposal: Proposal }>()
const emit = defineEmits<{ applied: [] }>()
const { modal, message } = App.useApp()
const router = useRouter(); const route = useRoute(); const closet = useClosetStore()
const scenes = ref<OutfitScene[]>([]); const error = ref(''); const busy = ref(false); const used = ref(props.proposal.consumed)
const current = computed(() => Boolean(canvasBridge.value && route.path.startsWith('/outfits/')))
async function preview() {
  error.value = ''
  try {
    scenes.value = props.proposal.kind === 'OUTFITS' ? await Promise.all(props.proposal.payload.candidates!.map(c => candidateScene(c))) : props.proposal.kind === 'EDIT' ? [await editedScene(props.proposal)] : []
  } catch (e) { error.value = e instanceof Error ? e.message : '预览无法加载。' }
}
onMounted(preview)
function confirmApply(index: number, intoCurrent: boolean) {
  modal.confirm({ title: props.proposal.kind === 'SAVE' ? '确认保存当前搭配？' : intoCurrent ? '确认将预览应用到当前画布？' : '新建一份独立搭配草稿？',
    content: props.proposal.kind === 'SAVE' ? '保存到账号后可在其他设备继续编辑，版本冲突时不会覆盖。' : '应用后仍是未保存草稿；保存到账号需要你再次确认。',
    okText: props.proposal.kind === 'SAVE' ? '确认保存' : '确认应用', cancelText: '取消',
    async onOk() {
      busy.value = true
      try {
        const proposal = props.proposal
        if (proposal.kind === 'SAVE' && !canvasBridge.value) throw new Error('请先打开生成建议时的组合台。')
        let scene = scenes.value[index]
        if (proposal.kind === 'OUTFITS' && intoCurrent) scene = await candidateScene(proposal.payload.candidates![index], proposal.context.scene?.elements.filter(e => e.kind === 'PERSON_PART') || [])
        // All preview work succeeds before the one-time confirmation token is consumed.
        await agentRequest(`/proposals/${proposal.id}/accept`, 'POST', { context: pageContext(route.path), current: intoCurrent })
        used.value = true
        if (proposal.kind === 'SAVE') await canvasBridge.value!.save()
        else if (intoCurrent) canvasBridge.value!.apply(scene, proposal.kind === 'OUTFITS' ? proposal.payload.candidates![index].name : undefined)
        else {
          const name = proposal.payload.candidates![index].name
          const key = `yixu.outfit-draft.v1:${closet.user!.username}:new:${proposal.id}`
          localStorage.setItem(key, JSON.stringify({ name, revision: null, scene, savedAt: Date.now() }))
          await router.push({ path: '/outfits/new', query: { draft: proposal.id } })
        }
        message.success(proposal.kind === 'SAVE' ? '保存请求已完成。' : '已应用为草稿，请检查后再保存。'); emit('applied')
      } catch (e) { message.error(e instanceof Error ? e.message : '应用失败。'); throw e }
      finally { busy.value = false }
    },
  })
}
</script>
<template>
  <section class="agent-proposal" aria-label="待确认操作">
    <div class="agent-proposal-heading"><strong>{{ proposal.kind === 'OUTFITS' ? '三套搭配 · 待你选择' : proposal.kind === 'EDIT' ? '画布修改预览' : '保存确认' }}</strong><span>{{ used ? '已处理' : '待确认' }}</span></div>
    <a-alert v-if="error" type="warning" :message="error" show-icon /><a-button v-if="error" size="small" @click="preview">重新加载预览</a-button>
    <template v-if="proposal.kind === 'OUTFITS'">
      <article v-for="(candidate, index) in proposal.payload.candidates" :key="index" class="agent-candidate">
        <OutfitThumbnail v-if="scenes[index]" :scene="scenes[index]" :title="candidate.name" /><div v-else class="agent-preview-loading">正在加载衣物预览…</div>
        <h3>{{ index + 1 }} · {{ candidate.name }}</h3><p>{{ candidate.reason }}</p>
        <div class="agent-candidate-actions"><a-button size="small" :disabled="used || !scenes[index] || busy" @click="confirmApply(index, false)">新建草稿</a-button><a-button v-if="current" size="small" :disabled="used || !scenes[index] || busy" @click="confirmApply(index, true)">应用当前</a-button></div>
      </article>
    </template>
    <template v-else-if="proposal.kind === 'EDIT'"><p>{{ proposal.payload.summary }}</p><OutfitThumbnail v-if="scenes[0]" :scene="scenes[0]" title="修改后画布" /><a-button :disabled="used || !current || !scenes[0] || busy" @click="confirmApply(0, true)">确认应用修改</a-button></template>
    <a-button v-else :disabled="used || !current || busy" @click="confirmApply(0, true)">确认保存当前搭配</a-button>
  </section>
</template>
