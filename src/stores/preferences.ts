import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

const storageKey = 'yuda.minimal.v1'
const navLabelsKey = 'yuda.nav-labels.v1'

/** How the mobile bottom bar and its add menu label things: icon + text (default), icon only, or text only. */
export type NavLabels = 'both' | 'icon' | 'text'
function savedNavLabels(): NavLabels {
  try { const value = localStorage.getItem(navLabelsKey); return value === 'icon' || value === 'text' ? value : 'both' }
  catch { return 'both' }
}

function saved() {
  try { return localStorage.getItem(storageKey) === '1' }
  catch { return false }
}

/**
 * Minimal mode (front issue #19): hides subtitles, explanations and secondary actions, keeping the main flow.
 * Saved in this browser only, like the theme. Pages read `minimal` for structural changes; plain text hiding is done
 * by CSS on html[data-density='minimal'] (see style.css).
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const minimal = ref(saved())
  watch(minimal, value => {
    if (value) document.documentElement.dataset.density = 'minimal'
    else delete document.documentElement.dataset.density
    try { localStorage.setItem(storageKey, value ? '1' : '0') }
    catch { /* Still applies for this visit. */ }
  }, { immediate: true })
  function toggle() { minimal.value = !minimal.value }
  // Applied as html[data-nav-labels]. Independent of minimal mode, which only hides explanations and secondary actions.
  const navLabels = ref<NavLabels>(savedNavLabels())
  watch(navLabels, value => {
    document.documentElement.dataset.navLabels = value
    try { localStorage.setItem(navLabelsKey, value) }
    catch { /* Still applies for this visit. */ }
  }, { immediate: true })
  return { minimal, toggle, navLabels }
})
