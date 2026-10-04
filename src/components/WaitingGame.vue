<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ReloadOutlined, CheckOutlined } from '@ant-design/icons-vue'
import BloubAvatar from '../agent/BloubAvatar.vue'
import TaskNotice from './TaskNotice.vue'
import { playSound } from '../services/sound'
import { useProcessingStore } from '../stores/processing'
import { useClosetStore } from '../stores/closet'
import { watch } from 'vue'
import sweatshirt from '../assets/waiting-game/sweatshirt.svg'
import jeans from '../assets/waiting-game/jeans.svg'
import sneaker from '../assets/waiting-game/sneaker.svg'
import cap from '../assets/waiting-game/cap.svg'
const processing = useProcessingStore()
const closet = useClosetStore()
const open = ref(false), turns = ref(0), first = ref<number | null>(null), second = ref<number | null>(null)
const matched = ref<number[]>([])
const designs = [
  { name: '卫衣', image: sweatshirt },
  { name: '牛仔裤', image: jeans },
  { name: '球鞋', image: sneaker },
  { name: '棒球帽', image: cap },
]
const deck = ref<number[]>([])
const complete = computed(() => matched.value.length === 8)
let coverTimer: ReturnType<typeof setTimeout> | undefined
function reset() {
  clearTimeout(coverTimer); first.value = null; second.value = null; turns.value = 0; matched.value = []
  const cards = [0, 1, 2, 3, 0, 1, 2, 3]
  for (let index = cards.length - 1; index > 0; index--) { const swap = Math.floor(Math.random() * (index + 1)); [cards[index], cards[swap]] = [cards[swap]!, cards[index]!] }
  deck.value = cards
}
function revealed(index: number) { return first.value === index || second.value === index || matched.value.includes(index) }
function flip(index: number) {
  if (revealed(index) || second.value !== null) return
  turns.value++; playSound('pop')
  if (first.value === null) { first.value = index; return }
  second.value = index
  if (deck.value[first.value] === deck.value[index]) {
    matched.value.push(first.value, index); first.value = null; second.value = null
    playSound(complete.value ? 'complete' : 'success')
  } else coverTimer = setTimeout(() => { first.value = null; second.value = null }, 900)
}
function show() { if (!deck.value.length) reset(); open.value = true }
watch(() => closet.user?.username, () => { open.value = false; reset() })
onMounted(() => window.addEventListener('closet-waiting-game-open', show))
onUnmounted(() => { clearTimeout(coverTimer); window.removeEventListener('closet-waiting-game-open', show) })
</script>
<template>
  <a-modal v-model:open="open" title="衣物记忆翻牌" :footer="null" :width="480" centered :destroy-on-close="false" class="waiting-game-modal">
    <TaskNotice @opened="open=false" />
    <div class="game-intro"><BloubAvatar :size="58" :expression="complete ? 'happy' : 'curious'" /><div><h3>{{ complete ? '都找到啦！' : '找出藏起来的四对衣物' }}</h3><p>{{ complete ? '衣柜也被你整理得整整齐齐。' : '没有倒计时，慢慢翻，随时可以离开。' }}</p></div></div>
    <div class="game-metrics"><span role="status">已配对 <strong>{{ matched.length / 2 }} / 4</strong></span><span>翻牌 <strong>{{ turns }}</strong> 次</span></div>
    <div class="memory-grid">
      <a-button v-for="(design, index) in deck" :key="index" class="memory-card" :class="{ revealed: revealed(index), matched: matched.includes(index) }" :aria-label="matched.includes(index) ? `第 ${index+1} 张，${designs[design]!.name}，已配对` : revealed(index) ? `第 ${index+1} 张，${designs[design]!.name}` : `翻开第 ${index+1} 张卡片`" :aria-disabled="matched.includes(index) || second !== null" :aria-pressed="revealed(index)" @click="flip(index)">
        <span v-if="revealed(index)" class="card-face" aria-hidden="true">
          <img :src="designs[design]!.image" alt="" width="128" height="128" draggable="false" />
          <span class="card-name">{{ designs[design]!.name }}</span>
        </span>
        <span v-else class="card-back" aria-hidden="true">
          <svg viewBox="0 0 80 96" fill="none">
            <rect x="5" y="5" width="70" height="86" rx="9" stroke="currentColor" opacity=".18" />
            <path d="M34 35a6 6 0 1 1 9 5c-2 1-3 2-3 5L20 57c-3 2-2 5 2 5h36c4 0 5-3 2-5L40 45" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M32 75h16M38 21h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".4" />
          </svg>
        </span><CheckOutlined v-if="matched.includes(index)" class="card-check" />
      </a-button>
    </div>
    <div class="game-bottom"><p role="status">{{ processing.activeCount ? `${processing.activeCount} 个任务仍在后台处理` : '处理结果可在站内任务中查看' }}</p><a-button :type="complete ? 'primary' : 'default'" @click="reset"><ReloadOutlined /> {{ complete ? '再玩一局' : '重新开始' }}</a-button></div>
    <p class="game-note">不消耗 AI 额度 · 关闭后保留本轮，刷新后重新开始</p>
  </a-modal>
</template>
<style scoped>
.game-intro{display:flex;gap:14px;align-items:center;margin:8px 0 22px}
.game-intro>div{min-width:0}
.game-intro h3{margin:0 0 5px;font-size:17px}
.game-intro p,.game-note{margin:0;color:var(--muted);font-size:12px;line-height:1.7}
.game-metrics{display:flex;justify-content:space-between;margin-bottom:14px;color:var(--muted);font-size:13px}
.game-metrics strong{color:var(--ink);font-size:15px;margin-left:5px}
.memory-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.memory-card.ant-btn{
  display:flex;align-items:center;justify-content:center;position:relative;
  width:100%;height:auto;aspect-ratio:4/5;padding:6px;border-radius:14px;
  border-color:var(--info-line);background:var(--info-bg);
  transition:background .2s ease-out,border-color .2s ease-out,transform .2s ease-out;
}
.memory-card:not(.revealed):hover{transform:translateY(-2px);border-color:var(--blue)}
.memory-card:not(.revealed):active{transform:translateY(0)}
.memory-card.revealed{background:var(--surface);border-color:var(--blue)}
.memory-card.matched{background:var(--surface);border-color:var(--success-line)}
.card-face{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:2px;width:100%;height:100%;min-width:0}
.card-face img{display:block;width:100%;height:100%;min-height:0;object-fit:contain;user-select:none}
.card-name{color:var(--ink);font-size:12px;font-weight:500;line-height:16px;letter-spacing:0}
.card-back{display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--info)}
.card-back svg{display:block;width:100%;height:100%}
.memory-card .card-check{position:absolute;right:4px;top:4px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;color:var(--success);background:var(--success-bg);font-size:10px}
.game-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin:20px 0 14px}
.game-bottom p{font-size:12px;color:var(--muted);margin:0}
.game-note{text-align:center}
@media(max-width:400px){.memory-grid{gap:8px}.memory-card.ant-btn{padding:4px;border-radius:10px}.game-intro{gap:8px}.game-intro h3{font-size:15px}.memory-card .card-check{width:14px;height:14px;right:2px;top:2px;font-size:9px}}
@media(prefers-reduced-motion:reduce){.memory-card.ant-btn{transition:none}.memory-card:not(.revealed):hover{transform:none}}
</style>
