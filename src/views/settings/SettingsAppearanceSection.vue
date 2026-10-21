<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue'
import { usePreferencesStore, type NavLabels } from '../../stores/preferences'
import { useThemeStore } from '../../stores/theme'
import type { ThemeMode } from '../../theme/tokens'
import { playSound } from '../../services/sound'
import NavGlyph from '../../shell/NavGlyph.vue'

/**
 * 界面偏好, three independent choices, each shown as what it looks like: the bottom bar style, light or dark, and
 * minimal mode (explanations and secondary actions only; it does not change the bar). Kept in this browser.
 */
const preferences = usePreferencesStore()
const appearance = useThemeStore()
const BAR_STYLES: { value: NavLabels; label: string }[] = [{ value: 'both', label: '图标 + 文字' }, { value: 'icon', label: '只要图标' }, { value: 'text', label: '只要文字' }]
const MINI = [{ glyph: 'wardrobe', label: '衣柜' }, { glyph: 'outfits', label: '搭配' }, { glyph: 'me', label: '我的' }] as const
const THEMES: { value: ThemeMode; label: string }[] = [{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]
function pickBar(value: NavLabels) { if (preferences.navLabels !== value) { preferences.navLabels = value; playSound('tick') } }
function pickTheme(value: ThemeMode) { if (appearance.mode !== value) { appearance.mode = value; playSound('tick') } }
</script>
<template>
  <div class="settings-section-content">
    <section class="settings-group">
      <header class="settings-group-head"><h3>底部导航栏</h3><p>手机和平板底部那一排，和「添加」弹出的卡片。</p></header>
      <div class="look-options" role="radiogroup" aria-label="底部导航栏样式">
        <a-button v-for="style in BAR_STYLES" :key="style.value" class="look-option" :class="{ chosen: preferences.navLabels === style.value }" role="radio" :aria-checked="preferences.navLabels === style.value" @click="pickBar(style.value)">
          <i class="look-bar" :data-mode="style.value">
            <em v-for="(item, index) in MINI" :key="item.glyph" :class="{ on: index === 0 }"><NavGlyph v-if="style.value !== 'text'" :name="item.glyph" :active="index === 0" /><b v-if="style.value !== 'icon'">{{ item.label }}</b></em>
          </i>
          <b class="look-caption">{{ style.label }}</b>
          <i class="look-check" aria-hidden="true"><CheckOutlined /></i>
        </a-button>
      </div>
    </section>

    <section class="settings-group">
      <header class="settings-group-head"><h3>颜色</h3><p>只改界面配色，导出的穿搭图始终是白底。</p></header>
      <div class="look-options two" role="radiogroup" aria-label="界面颜色">
        <a-button v-for="theme in THEMES" :key="theme.value" class="look-option" :class="{ chosen: appearance.mode === theme.value }" role="radio" :aria-checked="appearance.mode === theme.value" @click="pickTheme(theme.value)">
          <i class="look-theme" :data-theme-preview="theme.value"><em /><em /><em /></i>
          <b class="look-caption">{{ theme.label }}</b>
          <i class="look-check" aria-hidden="true"><CheckOutlined /></i>
        </a-button>
      </div>
    </section>

    <section class="settings-group">
      <div class="look-row">
        <div><strong>极简模式</strong><small class="muted">收起页面上的说明文字和次要按钮，熟悉以后更清爽。不影响底部导航栏。</small></div>
        <a-switch :checked="preferences.minimal" aria-label="极简模式" @change="preferences.toggle()" />
      </div>
    </section>
  </div>
</template>
<style scoped>
.look-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.look-options.two { grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 420px; }
.look-option.ant-btn { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 10px; height: auto; padding: 10px; border: 1.5px solid var(--line); border-radius: 16px; background: var(--surface); box-shadow: none; text-align: center; transition: border-color .2s ease, transform .25s cubic-bezier(.34, 1.56, .64, 1); }
.look-option.ant-btn:hover, .look-option.ant-btn:focus-visible { border-color: var(--muted-subtle); background: var(--surface); color: inherit; }
.look-option.ant-btn:active { transform: scale(.95); }
.look-option.chosen.ant-btn { border-color: var(--ink); }
.look-option.chosen.ant-btn:active { transform: scale(.97); }
.look-caption { font-size: 13px; font-weight: 500; color: var(--ink); }
.look-check { position: absolute; top: -7px; right: -7px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; font-style: normal; font-size: 11px; color: var(--action-fg); background: var(--action-bg); box-shadow: 0 0 0 3px var(--surface); transform: scale(0); transition: transform .3s cubic-bezier(.34, 1.56, .64, 1); }
.chosen .look-check { transform: scale(1); }

/* Mini bottom bar. */
.look-bar { display: grid; grid-template-columns: repeat(3, 1fr); align-items: center; height: 56px; padding: 0 4px; border-radius: 10px; font-style: normal; background: var(--surface-alt); }
.look-bar em { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-style: normal; color: var(--muted-subtle); }
.look-bar em.on { color: var(--ink); }
.look-bar b { font-size: 10px; font-weight: 500; line-height: 1.1; white-space: nowrap; }
.look-bar[data-mode='text'] b { font-size: 11px; }
.look-bar :deep(.nav-glyph) { width: 18px; height: 18px; }
.look-bar[data-mode='icon'] :deep(.nav-glyph) { width: 20px; height: 20px; }
.chosen .look-bar em.on :deep(.nav-glyph) { animation: look-pop .5s cubic-bezier(.34, 1.56, .64, 1); }
@keyframes look-pop { 0% { transform: scale(.7); } 60% { transform: scale(1.18); } 100% { transform: none; } }

/* Mini theme swatch: page, card, accent. */
.look-theme { position: relative; display: block; height: 56px; overflow: hidden; border-radius: 10px; font-style: normal; background: #f7f8fa; }
.look-theme em { position: absolute; display: block; border-radius: 6px; }
.look-theme em:nth-child(1) { left: 10px; top: 10px; width: 46%; height: 36px; background: #fff; box-shadow: 0 1px 3px #0000001a; }
.look-theme em:nth-child(2) { right: 10px; top: 12px; width: 28%; height: 8px; background: #d9dce3; }
.look-theme em:nth-child(3) { right: 10px; top: 26px; width: 18%; height: 18px; border-radius: 9px; background: #1f5c45; }
.look-theme[data-theme-preview='dark'] { background: #191c23; }
.look-theme[data-theme-preview='dark'] em:nth-child(1) { background: #242832; box-shadow: none; }
.look-theme[data-theme-preview='dark'] em:nth-child(2) { background: #3b404b; }
.look-theme[data-theme-preview='dark'] em:nth-child(3) { background: #5fcb9d; }

.look-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.look-row > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.look-row small { font-size: 12px; line-height: 1.6; }

@media (max-width: 767px) {
  .look-options { gap: 8px; }
  .look-option.ant-btn { padding: 8px; gap: 8px; }
  .look-options.two { max-width: none; }
}
@media (prefers-reduced-motion: reduce) {
  .look-option.ant-btn, .look-check { transition: none; }
  .chosen .look-bar em.on :deep(.nav-glyph) { animation: none; }
}
</style>
