import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark'

const storageKey = 'yuda.theme.v1'

function savedTheme(): ThemeMode {
  try { return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(savedTheme())
  const isDark = computed(() => mode.value === 'dark')

  watch(mode, (value) => {
    document.documentElement.dataset.theme = value
    document.documentElement.style.colorScheme = value
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#191c23' : '#f7f8fa')
    try { localStorage.setItem(storageKey, value) }
    catch { /* Theme changes still apply when storage is unavailable. */ }
  }, { immediate: true })

  function toggle() { mode.value = isDark.value ? 'light' : 'dark' }

  return { mode, isDark, toggle }
})
