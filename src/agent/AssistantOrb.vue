<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useClosetStore } from '../stores/closet'
import { useFloatingPosition } from './useFloatingPosition'
import BloubAvatar from './BloubAvatar.vue'
import { avatarPreferences, cueAllowed, duration, idleStates, type AvatarCue, type AvatarExpression } from './avatar'
import type { StateId } from './bloub/states'
const props = defineProps<{ open: boolean; mood: string; busy: boolean; phase: string; tool: string; cue: AvatarCue | null }>()
const emit = defineEmits<{ toggle: [] }>()
const closet=useClosetStore(), hovered=ref(false), pressed=ref(false), nearby=ref(false)
const control=ref<{ $el:HTMLButtonElement } | null>(null)
const key=computed(()=>`yixu.assistant-orb.v1:${closet.user?.username||'local'}`)
const position=useFloatingPosition(key,computed(()=>({width:64,height:64})),()=>window.innerWidth<1024?96:24)
const visible=ref(!document.hidden), reduced=ref(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
const media=window.matchMedia('(prefers-reduced-motion: reduce)')
const enabled=computed(()=>avatarPreferences.mode!=='static' && !reduced.value && visible.value)
const local=ref<StateId | null>(null), face=ref<AvatarExpression>('neutral'), look=ref({x:0,y:0})
const stretch=ref({angle:0,amount:0})
let actionSource='system'
let previous:{x:number;y:number;t:number}|undefined, idleTimer:ReturnType<typeof setTimeout>|undefined, actionTimer:ReturnType<typeof setTimeout>|undefined, lastIdle:StateId|undefined
const state=computed<StateId>(()=>{
  if(!enabled.value||pressed.value||position.dragging.value)return 'idle'
  if(props.busy)return props.phase==='responding' ? (local.value||'idle') : props.phase==='operating' ? (props.tool==='navigate'?'play':['search_help','search_wardrobe','get_garment','get_outfit'].includes(props.tool)?'comet':'orbit') : 'thinking'
  return local.value||'idle'
})
const expression=computed<AvatarExpression>(()=>props.mood==='concern'?'concern':props.busy?'attentive':hovered.value?'happy':face.value)
const idleAllowed=computed(()=>enabled.value&&!props.open&&!props.busy&&props.mood!=='concern'&&!nearby.value&&!hovered.value&&!pressed.value&&!position.dragging.value)
function clearAction(){clearTimeout(actionTimer);local.value=null;face.value='neutral'}
function play(state:StateId,expression:AvatarExpression='neutral',source='system'){
  clearAction();if(!enabled.value)return
  actionSource=source;local.value=state;face.value=expression
  actionTimer=setTimeout(()=>{local.value=null;face.value='neutral';schedule()},duration(state))
}
function schedule(){clearTimeout(idleTimer);if(!idleAllowed.value)return
  idleTimer=setTimeout(()=>{if(!idleAllowed.value)return;const pool=idleStates.filter(s=>s!==lastIdle);const next=pool[Math.floor(Math.random()*pool.length)]!;lastIdle=next;play(next,'neutral','idle')},10000+Math.random()*10000)
}
watch(idleAllowed,on=>{clearTimeout(idleTimer);if(!on && actionSource==='idle')clearAction();if(on)schedule()})
watch(()=>props.busy,on=>{if(on)clearAction();schedule()})
watch(()=>props.mood,mood=>{if(mood==='concern')play('alert','concern');else if(mood==='happy'&&!local.value)play('notify','happy')})
watch(()=>props.open,open=>{clearAction();if(open&&!props.busy)play('swirl','happy');schedule()})
watch(()=>props.cue,cue=>{if(cue && avatarPreferences.mode==='personal' && cueAllowed(cue.state) && (!props.busy||props.phase==='responding') && props.mood!=='concern')play(cue.state,cue.expression,'chat')})
watch(enabled,on=>{if(!on)clearAction();schedule()})
function down(e:PointerEvent){if(e.button!==0)return;position.start(e);pressed.value=true;clearAction();previous={x:e.clientX,y:e.clientY,t:performance.now()}}
function move(e:PointerEvent){
  position.move(e)
  if(!pressed.value||!previous)return
  const dx=e.clientX-previous.x,dy=e.clientY-previous.y,dt=Math.max(8,performance.now()-previous.t),speed=Math.hypot(dx,dy)/dt
  if(Math.hypot(dx,dy)>0){stretch.value={angle:Math.atan2(dy,dx)*180/Math.PI,amount:Math.min(.12,speed*.045)};look.value={x:Math.max(-1,Math.min(1,dx/10)),y:Math.max(-1,Math.min(1,dy/10))}}
  previous={x:e.clientX,y:e.clientY,t:performance.now()}
}
function end(){position.end();pressed.value=false;previous=undefined;stretch.value={angle:stretch.value.angle,amount:0};look.value={x:0,y:0};schedule()}
function activate(){if(position.clicked())emit('toggle')}
const deformation=computed(()=>!enabled.value?'none':position.dragging.value?`rotate(${stretch.value.angle}deg) scale(${1+stretch.value.amount},${1-stretch.value.amount*.6}) rotate(${-stretch.value.angle}deg)`:pressed.value?'scale(.96,.9)':'none')
function pointer(e:PointerEvent){
  if(e.pointerType==='touch'||pressed.value||!enabled.value)return
  const box=control.value?.$el.getBoundingClientRect();if(!box)return
  const dx=e.clientX-box.left-box.width/2,dy=e.clientY-box.top-box.height/2
  nearby.value=Math.hypot(dx,dy)<120
  look.value={x:Math.tanh(dx/240),y:Math.tanh(dy/240)}
}
function resetGaze(){nearby.value=false;hovered.value=false;look.value={x:0,y:0}}
function leave(e:PointerEvent){if(!e.relatedTarget&&!pressed.value)resetGaze()}
function hide(){visible.value=!document.hidden;if(!visible.value)resetGaze()}
function preference(){reduced.value=media.matches}
function saved(){if(!props.busy)play('burst','happy')}
const appearance=computed(()=>({state:state.value,expression:expression.value,animate:enabled.value,repeat:props.busy&&props.phase!=='responding',look:state.value==='idle'?look.value:null}))
const responding=computed(()=>enabled.value&&props.busy&&props.phase==='responding'&&!local.value)
defineExpose({focus:()=>control.value?.$el.focus(),appearance,responding})
onMounted(()=>{schedule();document.addEventListener('visibilitychange',hide);window.addEventListener('pointermove',pointer);document.addEventListener('pointerout',leave);window.addEventListener('blur',resetGaze);media.addEventListener('change',preference);window.addEventListener('closet-outfit-saved',saved)})
onUnmounted(()=>{clearTimeout(idleTimer);clearTimeout(actionTimer);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pointermove',pointer);document.removeEventListener('pointerout',leave);window.removeEventListener('blur',resetGaze);media.removeEventListener('change',preference);window.removeEventListener('closet-outfit-saved',saved)})
</script>
<template>
<Teleport to="body">
<a-tooltip :title="position.dragging.value?'':open?'收起助手 · 拖动可以移动':'找我聊聊 · 拖动可以移动'" placement="left">
<a-button ref="control" class="assistant-orb bloub-orb" shape="circle" :class="{dragging:position.dragging.value,active:open}" :style="position.style.value" :data-avatar-state="state" :data-avatar-mode="avatarPreferences.mode" data-sound="off" :aria-label="open?'收起个人助手':'打开个人助手'" :aria-expanded="open" aria-controls="closet-assistant" @pointerdown="down" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @keydown="position.keyboard" @click="activate" @pointerenter="hovered=true" @pointerleave="hovered=false">
<span class="bloub-orb-shape" :class="{'bloub-responding':responding}" :style="{transform:deformation}"><BloubAvatar v-bind="appearance" :size="80" /></span>
</a-button>
</a-tooltip>
</Teleport>
</template>
