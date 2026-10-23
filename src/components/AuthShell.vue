<script setup lang="ts">
import { computed } from 'vue'
import { CameraOutlined, SkinOutlined, ThunderboltOutlined } from '@ant-design/icons-vue'
import { useThemeStore } from '../stores/theme'
import ThemeToggle from './ThemeToggle.vue'

/**
 * 登录、注册与注册后问询共用的外框 (issue #82)，手机优先：手机上是顶部品牌区 + 底部表单卡片，
 * 表单卡片占下半屏、按钮贴近拇指；桌面上是左侧品牌介绍、右侧表单。
 */
defineProps<{ eyebrow?: string; title: string; intro?: string; compactArt?: boolean }>()
const appearance = useThemeStore()
const illustration = computed(() => appearance.isDark ? '/illustrations/yuda-login-dark.svg' : '/illustrations/yuda-login-light.svg')
const features = [
  { icon: CameraOutlined, title: '拍一下就入柜', text: '自动去背景、做成贴纸，识别品类和颜色' },
  { icon: ThunderboltOutlined, title: '今天穿什么', text: '按天气、场合和你的风格搭好几套' },
  { icon: SkinOutlined, title: 'OOTD 试穿', text: '选好的搭配一键看上身效果' },
]
</script>

<template>
  <div class="auth-shell" :class="{ 'compact-art': compactArt }">
    <section class="auth-art">
      <div class="auth-brand-row">
        <RouterLink to="/login" class="auth-brand" aria-label="鱼搭"><img src="/yuda-logo.png" alt="" /><span><strong>鱼搭</strong><small>数字衣橱</small></span></RouterLink>
        <ThemeToggle />
      </div>
      <img class="auth-illustration" :src="illustration" alt="" aria-hidden="true" />
      <p class="auth-tagline">从照片，<em>到你的数字衣柜。</em></p>
      <ul class="auth-features">
        <li v-for="f in features" :key="f.title"><span class="auth-feature-icon"><component :is="f.icon" /></span><span><strong>{{ f.title }}</strong><small>{{ f.text }}</small></span></li>
      </ul>
    </section>
    <main class="auth-sheet">
      <div class="auth-card">
        <slot name="top" />
        <p v-if="eyebrow" class="auth-eyebrow">{{ eyebrow }}</p>
        <h1 class="auth-title">{{ title }}</h1>
        <p v-if="intro" class="auth-intro">{{ intro }}</p>
        <slot />
        <div v-if="$slots.footer" class="auth-footer"><slot name="footer" /></div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth-shell { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); background: var(--paper); }
.auth-art { position: relative; display: flex; flex-direction: column; gap: 20px; padding: 40px clamp(32px, 6vw, 80px); overflow: hidden;
  background: radial-gradient(120% 80% at 0% 0%, var(--accent-soft) 0%, transparent 60%), radial-gradient(90% 70% at 100% 100%, var(--selection-bg) 0%, transparent 65%), var(--paper); }
.auth-brand-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.auth-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; }
.auth-brand img { width: 44px; height: 44px; object-fit: contain; padding: 4px; border-radius: 12px; background: var(--surface); box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
.auth-brand span { display: grid; line-height: 1.2; }
.auth-brand strong { font-size: 18px; }
.auth-brand small { color: var(--muted-subtle); font-size: 12px; }
.auth-illustration { align-self: center; width: min(78%, 480px); max-height: 46vh; object-fit: contain; margin-top: auto; }
.auth-tagline { margin: 0; font-size: clamp(24px, 2.4vw, 32px); line-height: 1.5; font-weight: 500; }
.auth-tagline em { display: block; color: var(--muted-subtle); font-style: normal; }
.auth-features { display: grid; gap: 14px; margin: 0 0 auto; padding: 0; list-style: none; }
.auth-features li { display: flex; align-items: flex-start; gap: 12px; }
.auth-features strong { display: block; font-size: 14px; }
.auth-features small { color: var(--muted-copy); font-size: 13px; }
.auth-feature-icon { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 10px; background: var(--surface); color: var(--accent); }
.auth-sheet { display: flex; align-items: center; justify-content: center; padding: 40px 24px; background: var(--surface); }
.auth-card { width: 100%; max-width: 400px; }
.auth-eyebrow { margin: 0 0 6px; color: var(--accent); font-size: 13px; font-weight: 600; letter-spacing: .04em; }
.auth-title { margin: 0; font-size: 30px; line-height: 1.3; }
.auth-intro { margin: 10px 0 0; color: var(--muted-copy); font-size: 14px; line-height: 1.7; }
.auth-footer { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; margin-top: 20px; color: var(--muted-copy); font-size: 13px; }

/* 手机：品牌区收成顶部一条，表单卡片从底部升起。 */
@media (max-width: 767px) {
  .auth-shell { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .auth-art { gap: 8px; padding: max(16px, env(safe-area-inset-top)) 16px 36px; }
  .auth-illustration { width: min(62%, 240px); max-height: 24vh; margin-top: 4px; }
  .compact-art .auth-illustration { display: none; }
  .auth-tagline { font-size: 20px; text-align: center; }
  .auth-tagline em { display: inline; }
  .compact-art .auth-tagline { display: none; }
  .auth-features { display: none; }
  .auth-sheet { align-items: flex-start; margin-top: -24px; padding: 28px 16px max(24px, env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; box-shadow: 0 -8px 24px rgba(0, 0, 0, .06); animation: auth-rise .45s cubic-bezier(.2, .8, .2, 1) both; }
  .auth-title { font-size: 24px; }
}
@keyframes auth-rise { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .auth-sheet { animation: none; } }
</style>
