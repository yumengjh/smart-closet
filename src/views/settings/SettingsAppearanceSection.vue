<script setup lang="ts">
import { CheckOutlined } from '@ant-design/icons-vue'
import { usePreferencesStore, type NavLabels } from '../../stores/preferences'
import { useThemeStore } from '../../stores/theme'
import type { ThemeMode } from '../../theme/tokens'
import { playSound } from '../../services/sound'
import NavGlyph from '../../shell/NavGlyph.vue'
import { onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { DEFAULT_WANTED_LABEL, WANTED_LABEL_MAX, loadWantedLabel, saveWantedLabel, wantedLabel } from '../../wardrobe/wanted'

/**
 * 界面偏好, two independent choices, each shown as what it looks like: the bottom bar style and light or dark.
 * Kept in this browser.
 */
const preferences = usePreferencesStore()
const appearance = useThemeStore()
const BAR_STYLES: { value: NavLabels; label: string }[] = [{ value: 'both', label: '图标 + 文字' }, { value: 'icon', label: '只要图标' }, { value: 'text', label: '只要文字' }]
const MINI = [{ glyph: 'today', label: '今天' }, { glyph: 'wardrobe', label: '衣柜' }, { glyph: 'me', label: '我的' }] as const
const THEMES: { value: ThemeMode; label: string }[] = [{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]
function pickBar(value: NavLabels) { if (preferences.navLabels !== value) { preferences.navLabels = value; playSound('tick') } }
function pickTheme(value: ThemeMode) { if (appearance.mode !== value) { appearance.mode = value; playSound('tick') } }
// 种草的叫法（#197）：网上看中、还没买的衣服在衣柜里叫什么。存在账号上，只改显示。
const { message } = App.useApp()
const labelDraft = ref(wantedLabel.value)
const savingLabel = ref(false)
onMounted(async () => { await loadWantedLabel(); labelDraft.value = wantedLabel.value })
async function saveLabel(value = labelDraft.value) {
  if (savingLabel.value || value.trim() === wantedLabel.value) { labelDraft.value = wantedLabel.value; return }
  savingLabel.value = true
  try { await saveWantedLabel(value); labelDraft.value = wantedLabel.value; playSound('tick'); message.success(`已改为“${wantedLabel.value}”`) }
  catch (cause) { message.error(cause instanceof Error ? cause.message : '没有保存成功，请再试一次。'); labelDraft.value = wantedLabel.value }
  finally { savingLabel.value = false }
}
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
      <header class="settings-group-head"><h3>“种草”的叫法</h3><p>网上看中、还没买的衣服可以存进衣柜，它们不参与推荐和统计。这里改它们在衣柜里显示的名字，最多 {{ WANTED_LABEL_MAX }} 个字，清空恢复“{{ DEFAULT_WANTED_LABEL }}”。</p></header>
      <div class="wanted-label-row">
        <a-input v-model:value="labelDraft" class="wanted-label-input" :maxlength="WANTED_LABEL_MAX" :placeholder="DEFAULT_WANTED_LABEL" aria-label="种草的叫法" allow-clear @press-enter="saveLabel()" />
        <a-button type="primary" :loading="savingLabel" :disabled="labelDraft.trim() === wantedLabel || (!labelDraft.trim() && wantedLabel === DEFAULT_WANTED_LABEL)" @click="saveLabel()">保存</a-button>
        <a-button v-if="wantedLabel !== DEFAULT_WANTED_LABEL" type="link" :disabled="savingLabel" @click="saveLabel('')">恢复默认</a-button>
      </div>
    </section>
  </div>
</template>
<style scoped>
.wanted-label-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.wanted-label-input.ant-input-affix-wrapper { width: 180px; max-width: 100%; }
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
.look-theme { position: relative; display: block; height: 56px; overflow: hidden; border-radius: 10px; font-style: normal; background: #f3f3f1; }
.look-theme em { position: absolute; display: block; border-radius: 6px; }
.look-theme em:nth-child(1) { left: 10px; top: 10px; width: 46%; height: 36px; background: #fff; box-shadow: 0 1px 3px #0000001a; }
.look-theme em:nth-child(2) { right: 10px; top: 12px; width: 28%; height: 8px; background: #d9dce3; }
.look-theme em:nth-child(3) { right: 10px; top: 26px; width: 18%; height: 18px; border-radius: 6px; background: #111111; }
.look-theme[data-theme-preview='dark'] { background: #0d0d0d; }
.look-theme[data-theme-preview='dark'] em:nth-child(1) { background: #1e1e1d; box-shadow: none; }
.look-theme[data-theme-preview='dark'] em:nth-child(2) { background: #3a3a38; }
.look-theme[data-theme-preview='dark'] em:nth-child(3) { background: #f2f2f0; }


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
