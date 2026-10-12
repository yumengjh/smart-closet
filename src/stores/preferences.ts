import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

const storageKey = 'yuda.minimal.v1'

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
  return { minimal, toggle }
})
