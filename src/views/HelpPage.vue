<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { agentRequest, type Article } from '../agent/api'
const route = useRoute(); const articles = ref<Article[]>([]); const error = ref('')
const current = computed(() => articles.value.find(a => a.id === route.query.article) || articles.value[0])
const blocks = computed(() => (current.value?.markdown || '').split(/\n\s*\n/).map(text => ({ text: text.replace(/^#{1,3}\s/, ''), heading: text.startsWith('# ') ? 1 : text.startsWith('## ') ? 2 : 0 })))
onMounted(async () => { try { articles.value = await agentRequest<Article[]>('/help') } catch (e) { error.value = e instanceof Error ? e.message : '帮助资料无法加载。' } })
</script>
<template>
  <div class="page-heading"><div><p class="eyebrow">平台使用指南</p><h1>鱼搭帮助</h1><p class="page-subtitle">与助手共享的说明资料，依据当前平台功能维护。</p></div></div>
  <a-alert v-if="error" type="error" :message="error" show-icon />
  <div class="help-layout"><nav aria-label="帮助文章"><RouterLink v-for="article in articles" :key="article.id" :to="article.href" :class="{ active: current?.id === article.id }">{{ article.title }}</RouterLink><RouterLink to="/wardrobe">回到我的衣柜 ↗</RouterLink></nav><article class="help-article"><template v-for="(block, index) in blocks" :key="index"><h1 v-if="block.heading === 1">{{ block.text }}</h1><h2 v-else-if="block.heading === 2">{{ block.text }}</h2><p v-else>{{ block.text }}</p></template><footer>没有找到需要的说明时，助手会明确表示暂时不知道。你可以向平台反馈；当前版本尚无反馈提交入口。</footer></article></div>
</template>
