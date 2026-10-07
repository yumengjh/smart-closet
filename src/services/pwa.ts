import { computed, readonly, ref } from 'vue'
import { detectInstallPlatform } from '../domain/install-platform'

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string }
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<InstallChoice>
}

const standaloneQuery = window.matchMedia('(display-mode: standalone)')
const promptEvent = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(isStandalone())

export const installPlatform = detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints)
export const appInstalled = readonly(installed)
export const canPromptInstall = computed(() => promptEvent.value !== null)

function isStandalone() {
  return Boolean(standaloneQuery.matches || (navigator as Navigator & { standalone?: boolean }).standalone)
}

/** 尽早监听：浏览器可能在用户打开设置页之前就派发安装事件。 */
export function installPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    promptEvent.value = event as BeforeInstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    promptEvent.value = null
    installed.value = true
  })
  standaloneQuery.addEventListener('change', () => { installed.value = isStandalone() })

  // 开发环境不注册，避免缓存干扰 Vite 热更新；Service Worker 也只能运行在安全上下文。
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* 离线能力可选，注册失败不影响正常使用。 */ })
  }, { once: true })
}

/** 唤起浏览器原生安装弹窗；返回 undefined 表示当前浏览器不提供该弹窗。 */
export async function promptInstall(): Promise<InstallChoice['outcome'] | undefined> {
  const event = promptEvent.value
  if (!event) return undefined
  promptEvent.value = null
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome
}
