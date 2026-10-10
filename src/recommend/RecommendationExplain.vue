<script setup lang="ts">
import { CheckCircleFilled, ExclamationCircleFilled } from '@ant-design/icons-vue'
import { ROLE_LABELS, scoreTone, type RecommendedOutfit } from './types'

defineProps<{ outfit: RecommendedOutfit }>()
</script>

<template>
  <div class="recommend-explain">
    <section aria-label="各项得分">
      <h4>各项得分</h4>
      <div v-for="d in outfit.dimensions" :key="d.key" class="recommend-dimension">
        <div class="recommend-dimension-head"><span>{{ d.label }}</span><small>权重 {{ d.weight }}</small><strong>{{ d.score }}</strong></div>
        <a-progress :percent="d.score" :show-info="false" size="small" :status="scoreTone(d.score) === 'exception' ? 'exception' : 'normal'" :aria-label="`${d.label} ${d.score} 分`" />
        <ul v-if="d.evidence.length">
          <li v-for="(line, i) in d.evidence" :key="i" :class="line.positive ? 'is-positive' : 'is-negative'">
            <CheckCircleFilled v-if="line.positive" /><ExclamationCircleFilled v-else />{{ line.text }}
          </li>
        </ul>
      </div>
    </section>
    <section aria-label="每件衣物为什么入选">
      <h4>每件为什么入选</h4>
      <ul class="recommend-garments">
        <li v-for="g in outfit.garments" :key="g.id">
          <div><strong>{{ g.name }}</strong><a-tag>{{ ROLE_LABELS[g.role] || g.role }}</a-tag><small>{{ g.color }}</small></div>
          <p v-if="g.reasons.length">{{ g.reasons.join(' · ') }}</p>
        </li>
      </ul>
    </section>
    <section v-if="outfit.accessories?.length || outfit.tips?.length" aria-label="可以搭配的配件" class="recommend-outers">
      <h4>可以搭配的配件</h4>
      <a-alert v-for="t in outfit.tips || []" :key="t" type="info" show-icon :message="t" />
      <ul v-if="outfit.accessories?.length" class="recommend-garments">
        <li v-for="a in outfit.accessories" :key="a.id">
          <div><strong>{{ a.name }}</strong><a-tag>{{ ROLE_LABELS[a.role] || a.role }}</a-tag></div>
          <p v-if="a.reasons.length">{{ a.reasons.join(' · ') }}</p>
        </li>
      </ul>
    </section>
    <section v-if="outfit.outers.length" aria-label="建议外层" class="recommend-outers">
      <h4>建议外层</h4>
      <a-alert type="info" show-icon message="天气偏凉，可以自行加一件外套。叠穿资料未核对，请自行确认，它不会放进这套搭配。" />
      <ul class="recommend-garments">
        <li v-for="o in outfit.outers" :key="o.id"><div><strong>{{ o.name }}</strong></div><p v-if="o.reasons.length">{{ o.reasons.join(' · ') }}</p></li>
      </ul>
    </section>
  </div>
</template>
