import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

const navLabelsKey = 'yuda.nav-labels.v1'

/** How the mobile bottom bar and its add menu label things: icon + text (default), icon only, or text only. */
export type NavLabels = 'both' | 'icon' | 'text'
function savedNavLabels(): NavLabels {
  try { const value = localStorage.getItem(navLabelsKey); return value === 'icon' || value === 'text' ? value : 'both' }
  catch { return 'both' }
}

/**
 * Interface preferences kept in this browser only, like the theme. 极简模式 was removed in the fresh redesign
 * (清新改版): the whole site is now plain by default; its old saved key 'yuda.minimal.v1' is cleared once.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  try { localStorage.removeItem('yuda.minimal.v1') } catch { /* storage blocked */ }
  // Applied as html[data-nav-labels].
  const navLabels = ref<NavLabels>(savedNavLabels())
  watch(navLabels, value => {
    document.documentElement.dataset.navLabels = value
    try { localStorage.setItem(navLabelsKey, value) }
    catch { /* Still applies for this visit. */ }
  }, { immediate: true })
  return { navLabels }
})
