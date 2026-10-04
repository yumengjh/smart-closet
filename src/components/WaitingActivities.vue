<script setup lang="ts">
import { useRouter } from 'vue-router'
import { MessageOutlined, AppstoreOutlined, ArrowRightOutlined } from '@ant-design/icons-vue'
defineProps<{ invitation?: boolean }>()
const emit = defineEmits<{ chosen: [] }>()
const router = useRouter()
function chat() { emit('chosen'); window.dispatchEvent(new CustomEvent('closet-assistant-open', { detail: { waiting: true } })) }
function game() { emit('chosen'); window.dispatchEvent(new Event('closet-waiting-game-open')) }
function wardrobe() { emit('chosen'); void router.push('/wardrobe') }
</script>
<template>
  <section class="waiting-activities" :class="{ invitation }" aria-label="等待时做点什么">
    <div class="waiting-activities-heading"><strong>{{ invitation ? '这会儿，你想做点什么？' : '照片交给鱼搭，你可以先歇一会儿' }}</strong><p>处理在后台继续，完成后会在站内提醒你。</p></div>
    <div class="waiting-activities-buttons"><a-button :type="invitation ? 'primary' : 'default'" @click="chat"><MessageOutlined /> 和鱼搭助手聊聊</a-button><a-button @click="game"><AppstoreOutlined /> 衣物记忆翻牌</a-button><a-button type="text" @click="wardrobe">先去逛衣柜 <ArrowRightOutlined /></a-button></div>
    <small>小游戏不消耗 AI 额度 · 聊天发送后使用现有消息额度</small>
  </section>
</template>
<style scoped>
.waiting-activities{width:100%;padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--surface);text-align:left}.waiting-activities-heading strong{font-size:16px;font-weight:600}.waiting-activities-heading p{margin:8px 0 18px;color:var(--muted);font-size:14px;line-height:1.7}.waiting-activities-buttons{display:flex;flex-wrap:wrap;gap:10px}.waiting-activities small{display:block;margin-top:14px;font-size:12px;color:var(--muted);line-height:1.7}@media(max-width:640px){.waiting-activities{padding:20px 16px}.waiting-activities-buttons{display:grid;grid-template-columns:1fr}.waiting-activities-buttons .ant-btn{width:100%}}
</style>
<style scoped>
.waiting-activities.invitation{border:0;padding:0}.invitation .waiting-activities-buttons{display:grid;grid-template-columns:1fr}.invitation .waiting-activities-buttons .ant-btn{width:100%;min-height:44px}.invitation small{text-align:center}
</style>
