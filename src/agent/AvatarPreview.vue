<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import BloubAvatar from './BloubAvatar.vue'
import { avatarLabels, duration } from './avatar'
import type { StateId } from './bloub/states'
const selected=ref<StateId>('idle'), current=ref<StateId>('idle'), running=ref(false), sequence=ref(false), replay=ref(0)
const label=computed(()=>sequence.value&&current.value==='idle'?'正在回复':avatarLabels[current.value])
let timer:ReturnType<typeof setTimeout>|undefined
function stop(){clearTimeout(timer);running.value=false;sequence.value=false}
function play(){stop();current.value=selected.value;replay.value++;running.value=true;timer=setTimeout(()=>{running.value=false},duration(current.value))}
function flow(){stop();sequence.value=true;running.value=true;const states:StateId[]=['thinking','orbit','idle','notify'];let i=0
 function next(){current.value=states[i]!;replay.value++;timer=setTimeout(()=>{if(++i<states.length)next();else stop()},current.value==='idle'?2200:duration(current.value))}next()
}
onUnmounted(stop)
</script>
<template>
<div class="avatar-preview">
<div class="avatar-preview-stage" :class="{'bloub-responding':sequence&&running&&current==='idle'}"><BloubAvatar :key="replay" :state="current" :size="156" :animate="running" :expression="current==='idle'&&sequence?'attentive':'happy'" /><span role="status">{{ label }}{{ running ? ' · 播放中' : '' }}</span></div>
<div class="avatar-preview-controls"><a-select v-model:value="selected" aria-label="选择助手预览动画" :options="Object.entries(avatarLabels).map(([value,label])=>({value,label}))" @change="stop();current=selected" /><div><a-button @click="play">播放动作</a-button><a-button @click="flow">预览任务流程</a-button><a-button :disabled="!running" @click="stop">停止</a-button></div><p class="settings-hint">所有 14 个动作和唤起过渡均可预览。不调用模型、不影响助手。系统减少动态效果开启时显示静态姿态。</p></div>
</div>
</template>
