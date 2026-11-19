import { computed, ref } from 'vue'
import { soundEnabled } from '../services/sound'

/**
 * 取景语音提示：用浏览器自带的离线朗读，只念取景提示，不念计费、错误等其他文字。
 * 开关记在本机，默认关闭；全站音效关闭时一律不出声。
 */
const KEY = 'yuda.tryon.voice'
const chosen = ref((() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })())
export const voiceSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
/** 用户打开了语音提示（不论全站音效）。 */
export const voiceChosen = computed(() => chosen.value)
/** 真正会出声：支持朗读、用户打开、全站音效开着。 */
export const voiceOn = computed(() => voiceSupported && chosen.value && soundEnabled.value)

export function setVoice(on: boolean) {
  chosen.value = on
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* 只是偏好 */ }
  if (!on) hush()
}

let chinese: SpeechSynthesisVoice | null | undefined
function pickVoice() {
  if (chinese !== undefined) return chinese
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  chinese = voices.find(v => /^zh[-_]CN/i.test(v.lang) && v.localService) || voices.find(v => /^zh/i.test(v.lang)) || null
  return chinese
}

/** 念一句，打断上一句：人在动，过时的提示没必要念完。 */
export function say(text: string) {
  if (!voiceOn.value || !text || document.visibilityState !== 'visible') return
  try {
    const synth = window.speechSynthesis
    synth.cancel()
    const line = new SpeechSynthesisUtterance(text)
    line.lang = 'zh-CN'; line.rate = 1.05; line.volume = 0.9
    const voice = pickVoice()
    if (voice) line.voice = voice
    synth.speak(line)
  } catch { /* 朗读只是增强 */ }
}

export function hush() {
  if (!voiceSupported) return
  try { window.speechSynthesis.cancel() } catch { /* 朗读只是增强 */ }
}
