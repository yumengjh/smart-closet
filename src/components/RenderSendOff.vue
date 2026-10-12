<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { App } from 'ant-design-vue'
import { useSendOffStore, type SendOff } from '../stores/sendOff'
import { mediaUrl } from '../services/urls'
import { playSound } from '../services/sound'
import PoseFigure from '../ootd/PoseFigure.vue'
// Hand-off ritual: cards are dealt, dressed onto the model, then the bundle flies into the top-right processing centre.
const sendOff = useSendOffStore(), { message } = App.useApp()
type Phase = 'deal' | 'dress' | 'fly'
const shown = ref<SendOff | null>(null), phase = ref<Phase>('deal'), flight = ref({ x: 0, y: 0 }), stage = ref<HTMLElement>()
const timers: ReturnType<typeof setTimeout>[] = []
const later = (ms: number, run: () => void) => { timers.push(setTimeout(run, ms)) }
const clear = () => { timers.splice(0).forEach(clearTimeout) }
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Garment cards plus an optional pose card, fanned around the centre.
const cards = computed(() => {
  const list = [...(shown.value?.cards || []).map(card => ({ ...card, pose: false })), ...(shown.value?.pose ? [{ label: shown.value.pose.name, pose: true, image: undefined }] : [])]
  const middle = (list.length - 1) / 2
  return list.map((card, index) => ({ ...card, style: { '--i': index - middle, '--a': Math.abs(index - middle), '--d': `${index * 90}ms` } }))
})
const caption = computed(() => phase.value === 'deal' ? shown.value?.title : phase.value === 'dress' ? '正在为你穿上身…' : '已放进右上角，好了会叫你')
function target() {
  const trigger = document.querySelector('.task-inbox-trigger')?.getBoundingClientRect(), box = stage.value?.getBoundingClientRect()
  if (!box) return { x: 0, y: 0 }
  const to = trigger ? { x: trigger.left + trigger.width / 2, y: trigger.top + trigger.height / 2 } : { x: window.innerWidth - 40, y: 28 }
  return { x: to.x - (box.left + box.width / 2), y: to.y - (box.top + box.height / 2) }
}
function finish(item: SendOff) {
  clear(); shown.value = null; sendOff.land(item.id); playSound('drop')
  message.info({ content: '已开始生成，通常 1 分钟左右。可以先逛逛，好了右上角会提醒你。', duration: 4 })
}
function fly(item: SendOff) {
  if (shown.value?.id !== item.id || phase.value === 'fly') return
  clear(); flight.value = target(); phase.value = 'fly'; playSound('rise')
  later(720, () => finish(item))
}
function run(item: SendOff) {
  clear()
  if (reduced()) { shown.value = null; finish(item); return }
  shown.value = item; phase.value = 'deal'; playSound('pop')
  const dealt = 520 + cards.value.length * 90
  if (item.person) {
    later(dealt + 300, () => { phase.value = 'dress'; playSound('sparkle') })
    later(dealt + 1300, () => fly(item))
  } else later(dealt + 500, () => fly(item))
}
function skip() { if (shown.value) fly(shown.value) }
function key(event: KeyboardEvent) { if (event.key === 'Escape') skip() }
watch(() => sendOff.current, item => { if (item) void nextTick(() => run(item)) })
watch(shown, item => item ? window.addEventListener('keydown', key) : window.removeEventListener('keydown', key))
onUnmounted(() => { clear(); window.removeEventListener('keydown', key) })
</script>
<template>
  <Teleport to="body">
    <Transition name="send-off-fade">
      <div v-if="shown" class="send-off" :class="[phase, { dressing: !!shown.person }]" role="status" aria-live="polite" @click="skip">
        <div ref="stage" class="send-off-stage" :style="{ '--fx': `${flight.x}px`, '--fy': `${flight.y}px`, '--n': cards.length }">
          <div v-if="shown.person" class="send-off-person"><img :src="mediaUrl(shown.person)" alt="" /><i class="send-off-shine" /></div>
          <div v-for="(card, index) in cards" :key="index" class="send-off-card" :class="{ pose: card.pose, plain: !card.pose && !card.image }" :style="card.style">
            <PoseFigure v-if="card.pose && shown.pose" :pose="shown.pose" />
            <img v-else-if="card.image" :src="mediaUrl(card.image)" alt="" />
            <small>{{ card.label }}</small>
          </div>
          <span class="send-off-spark s1" /><span class="send-off-spark s2" /><span class="send-off-spark s3" />
        </div>
        <p class="send-off-caption">{{ caption }}</p>
        <small class="send-off-skip">点任意处收起</small>
      </div>
    </Transition>
  </Teleport>
</template>
<style scoped>
.send-off { position: fixed; inset: 0; z-index: 1100; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; background: color-mix(in srgb, var(--canvas) 72%, transparent); backdrop-filter: blur(6px); cursor: pointer; transition: background .5s ease, backdrop-filter .5s ease; }
.send-off.fly { background: transparent; backdrop-filter: none; pointer-events: none; }
.send-off-stage { --spread: min(78px, calc((100vw - 140px) / var(--n))); position: relative; width: 180px; height: 240px; transition: transform .7s cubic-bezier(.55, 0, .75, .2), opacity .7s ease-in; }
.fly .send-off-stage { transform: translate(var(--fx), var(--fy)) scale(.08) rotate(-12deg); opacity: .2; }
.send-off-person { position: absolute; inset: 0; overflow: hidden; border-radius: 18px; background: var(--paper); box-shadow: 0 18px 50px #25262b2e; opacity: 0; transform: scale(.86) translateY(16px); transition: opacity .45s ease, transform .55s cubic-bezier(.2, .9, .3, 1.2); }
.send-off-person img { width: 100%; height: 100%; object-fit: cover; }
.dress .send-off-person, .fly .send-off-person { opacity: 1; transform: none; }
.send-off-shine { position: absolute; inset: 0; background: linear-gradient(115deg, transparent 30%, #ffffffb3 48%, transparent 64%); transform: translateX(-120%); }
.dress .send-off-shine { animation: send-off-shine 1s .25s ease-in-out; }
.send-off-card { position: absolute; top: 50%; left: 50%; display: flex; flex-direction: column; width: 92px; height: 118px; margin: -59px 0 0 -46px; padding: 8px 8px 6px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); box-shadow: 0 10px 28px #25262b26; transform: translate(calc(var(--i) * var(--spread)), calc(var(--a) * 10px)) rotate(calc(var(--i) * 8deg)); animation: send-off-deal .55s var(--d) cubic-bezier(.2, .9, .3, 1.15) backwards; transition: transform .6s cubic-bezier(.6, 0, .3, 1), opacity .5s ease .1s; }
.send-off-card img { flex: 1; min-height: 0; width: 100%; object-fit: contain; }
.send-off-card.pose :deep(svg) { flex: 1; min-height: 0; width: 100%; border-radius: 8px; }
.send-off-card.plain { justify-content: center; }
.send-off-card small { overflow: hidden; margin-top: 4px; font-size: 11px; color: var(--muted-strong); text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.dress .send-off-card, .fly.dressing .send-off-card { transform: translate(0, 10px) scale(.35) rotate(0); opacity: 0; transition-delay: calc(var(--d) * .6); }
.send-off-spark { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); opacity: 0; }
.s1 { top: 6%; left: -8%; } .s2 { top: 30%; right: -10%; width: 6px; height: 6px; } .s3 { bottom: 8%; left: 4%; width: 5px; height: 5px; }
.dress .send-off-spark { animation: send-off-spark .9s ease-out both; } .dress .s2 { animation-delay: .15s; } .dress .s3 { animation-delay: .3s; }
.send-off-caption { min-height: 24px; margin: 0; font-size: 16px; font-weight: 500; color: var(--ink); letter-spacing: .02em; transition: opacity .3s; }
.send-off-skip { position: absolute; bottom: 28px; font-size: 12px; color: var(--muted-subtle); }
.fly .send-off-caption, .fly .send-off-skip { opacity: 0; }
.send-off-fade-enter-active { transition: opacity .3s ease; } .send-off-fade-leave-active { transition: opacity .2s ease; }
.send-off-fade-enter-from, .send-off-fade-leave-to { opacity: 0; }
@keyframes send-off-deal { from { opacity: 0; transform: translate(0, 46vh) rotate(calc(var(--i) * -24deg)) scale(.8); } }
@keyframes send-off-shine { to { transform: translateX(120%); } }
@keyframes send-off-spark { 0% { opacity: 0; transform: scale(0); } 40% { opacity: 1; transform: scale(1.4); } 100% { opacity: 0; transform: scale(.4) translateY(-18px); } }
@media (max-width: 640px) { .send-off-stage { --spread: min(60px, calc((100vw - 110px) / var(--n))); width: 150px; height: 200px; } .send-off-card { width: 76px; height: 98px; margin: -49px 0 0 -38px; } }
</style>
