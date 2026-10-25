<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { SkinOutlined } from '@ant-design/icons-vue'
import { thumbUrl } from '../services/urls'
import { LEVEL_LABELS, type SimilarLevel } from '../similar/api'
import type { DuplicatePairItem, DuplicateSide } from './api'
import { sendToAssistant } from './assistantEvents'

/**
 * 可能重复卡：pairs the local duplicate check flagged. Tapping a garment opens it; "不是重复" goes back to the
 * assistant as a chat message so it can propose the confirmation card.
 */
const props = defineProps<{ payload: { pairs?: DuplicatePairItem[]; total?: number } }>()
const emit = defineEmits<{ applied: [] }>()
const router = useRouter()
const pairs = computed(() => (props.payload.pairs || []).filter(p => p?.a?.id && p?.b?.id))
const total = computed(() => Math.max(props.payload.total ?? 0, pairs.value.length))
const broken = reactive<Record<string, boolean>>({})
const src = (g: DuplicateSide) => broken[g.id] ? '' : thumbUrl(g.displayUrl, 144) || ''
const level = (value: string) => LEVEL_LABELS[value as SimilarLevel] || { label: value || '可能重复', color: 'orange' }
function open(g: DuplicateSide) { void router.push(`/garment/${g.id}`); emit('applied') }
function notDuplicate(pair: DuplicatePairItem) { sendToAssistant(`「${pair.a.name}」和「${pair.b.name}」不是重复`) }
</script>
<template>
  <section class="agent-duplicates" aria-label="可能重复的衣物">
    <small class="muted">找到 {{ total }} 组可能重复<template v-if="total > pairs.length">，这里列出 {{ pairs.length }} 组</template>，点衣物查看详情：</small>
    <p v-if="!pairs.length" class="agent-card-empty">没有发现可能重复的衣物。</p>
    <article v-for="pair in pairs" :key="`${pair.a.id}:${pair.b.id}`" class="agent-duplicate-pair">
      <div class="agent-duplicate-garments">
        <a-button v-for="g in [pair.a, pair.b]" :key="g.id" type="text" class="agent-duplicate-garment" :aria-label="`查看衣物「${g.name}」`" @click="open(g)">
          <span class="recommend-thumb agent-duplicate-thumb"><img v-if="src(g)" :src="src(g)" :alt="g.name" loading="lazy" decoding="async" @error="broken[g.id] = true" /><SkinOutlined v-else aria-hidden="true" /></span>
          <span :title="g.name">{{ g.name || '未命名衣物' }}</span>
        </a-button>
      </div>
      <div class="agent-duplicate-meta">
        <div class="recommend-tags"><a-tag :color="level(pair.level).color">{{ level(pair.level).label }}</a-tag><a-tag v-for="reason in pair.reasons || []" :key="reason">{{ reason }}</a-tag></div>
        <a-button size="small" @click="notDuplicate(pair)">不是重复</a-button>
      </div>
    </article>
  </section>
</template>
