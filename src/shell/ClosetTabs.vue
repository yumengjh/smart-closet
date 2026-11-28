<script setup lang="ts">
// 衣柜里的三样东西——衣服、搭配、穿搭收藏——在页面顶部同一排切换，手机和电脑一致（server#303，用户 2026-11-28：
// 搭配原来只能从“我的”的计数进，穿搭收藏藏在衣柜工具栏里）。底部胶囊里三者都算“衣柜”。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// Tabs 没有在 main.ts 全局注册（组件按需注册），这里本地引入，否则 <a-tabs> 不会渲染。
import { Tabs as ATabs } from 'ant-design-vue'

const ATabPane = ATabs.TabPane
const route = useRoute()
const router = useRouter()
const tabs = [
  { key: '/wardrobe', tab: '衣服' },
  { key: '/outfits', tab: '搭配' },
  { key: '/inspirations', tab: '穿搭收藏' },
]
const active = computed(() => tabs.find(t => route.path === t.key || route.path.startsWith(`${t.key}/`))?.key ?? '/wardrobe')
function go(key: string | number) {
  if (key !== active.value) void router.push(String(key))
}
</script>

<template>
  <a-tabs class="closet-tabs" :active-key="active" :tab-bar-gutter="24" aria-label="衣柜里的内容" @change="go">
    <a-tab-pane v-for="t in tabs" :key="t.key" :tab="t.tab" />
  </a-tabs>
</template>

<style scoped>
.closet-tabs { margin: 0 0 10px; }
.closet-tabs :deep(.ant-tabs-nav) { margin: 0; }
.closet-tabs :deep(.ant-tabs-nav::before) { border-bottom-color: var(--line); }
.closet-tabs :deep(.ant-tabs-tab) { padding: 4px 0 10px; font-size: 15px; }
.closet-tabs :deep(.ant-tabs-tab .ant-tabs-tab-btn) { color: var(--muted); }
.closet-tabs :deep(.ant-tabs-tab-active .ant-tabs-tab-btn) { color: var(--ink); font-weight: 600; }
.closet-tabs :deep(.ant-tabs-ink-bar) { background: var(--ink); }
.closet-tabs :deep(.ant-tabs-content-holder) { display: none; }
@media (max-width: 767px) { .closet-tabs :deep(.ant-tabs-tab) { font-size: 16px; } }
</style>
