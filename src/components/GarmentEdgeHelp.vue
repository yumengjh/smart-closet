<script setup lang="ts">
import { ref } from 'vue'
import { InfoCircleOutlined } from '@ant-design/icons-vue'
const open = ref(false)
const guides = [
  { title: '背景与衣物分开', body: '浅色衣物配稍深的背景，深色衣物配浅一些的背景。避免白衣融进白床单、黑衣融进暗处。' },
  { title: '保留细小结构', body: '蕾丝、薄纱、流苏、毛边，以及细肩带和鞋带要放大检查。细线、孔洞和半透明区域可能被误删。' },
  { title: '让轮廓完整入镜', body: '衣物四周留一点空隙，手、手机和其他衣物尽量别挡住。多件同框时分开放，减少互相遮挡。' },
]
</script>
<template>
  <aside class="garment-edge-note" aria-label="衣物边缘检查提醒">
    <a-button type="text" @click="open=true"><InfoCircleOutlined /> 衣物边缘与拍摄建议</a-button>
    <a-modal v-model:open="open" title="让衣物边缘更清楚" :width="900" :footer="null" class="edge-help-modal">
      <p class="edge-help-intro">不用拍成商品图。换一个背景、留一点空隙，往往更容易处理。</p>
      <div class="edge-guide-grid">
        <section v-for="(guide, index) in guides" :key="guide.title" class="edge-guide">
          <svg v-if="index === 0" viewBox="0 0 240 144" role="img" aria-label="浅色衣物与深色背景的示意图"><rect width="240" height="144" rx="10" fill="#dee5ec" /><path d="M84 20L57 30L34 63L60 80L73 63V127H167V63L180 80L206 63L183 30L156 20Q120 46 84 20Z" fill="white" stroke="#8f9bab" stroke-width="2" /></svg>
          <svg v-else-if="index === 1" viewBox="0 0 240 144" role="img" aria-label="细肩带与流苏的示意图"><rect width="240" height="144" rx="10" fill="#f1f4f7" /><path d="M76 23V55L53 130H185L162 55V23H151V53Q119 74 87 53V23Z" fill="#8cb3cf" stroke="#597d97" stroke-width="2" /><circle cx="151" cy="44" r="22" fill="none" stroke="#1f5c45" stroke-width="2" stroke-dasharray="4 3" /><path d="M70 130V137M86 130V139M102 130V136M118 130V139M134 130V136M150 130V139M166 130V137" stroke="#597d97" stroke-width="2" /></svg>
          <svg v-else viewBox="0 0 240 144" role="img" aria-label="完整轮廓与拍摄留白的示意图"><rect width="240" height="144" rx="10" fill="#f1f4f7" /><rect x="25" y="12" width="190" height="120" rx="8" fill="none" stroke="#1f5c45" stroke-width="2" stroke-dasharray="5 4" /><path d="M95 33L72 43L54 67L76 78L85 65V113H155V65L164 78L186 67L168 43L145 33Q120 50 95 33Z" fill="#758ca6" stroke="#536983" stroke-width="2" /></svg>
          <h3>{{ guide.title }}</h3><p>{{ guide.body }}</p><small>示意图 · 非模型处理结果</small>
        </section>
      </div>
      <a-alert class="edge-review-alert" type="warning" :show-icon="false" message="处理完成后，先看边缘，再确认入柜" description="对照原图放大检查：领口、袖口、裙摆、鞋带和细肩带是否完整；蕾丝孔洞、薄纱透感是否保留；四周有没有背景残留或白边。" />
      <section class="edge-next"><h3>如果边缘不理想</h3><p>仅背景残留：重新去背景。<br />细节被遮住或融进背景：换背景、补拍一张，再处理。</p></section>
      <div class="edge-help-footer"><span>原图保留，核对时随时可以对照。</span><a-button type="primary" @click="open = false">我知道了</a-button></div>
    </a-modal>
  </aside>
</template>
<style scoped>
.garment-edge-note{margin-top:20px}.garment-edge-note>.ant-btn{min-height:36px;color:var(--muted)}.garment-edge-note :deep(.ant-alert){padding:18px 20px;border-radius:var(--radius-lg)}.garment-edge-note :deep(.ant-alert-message){font-weight:600}.garment-edge-note p{font-size:13px;line-height:1.7;margin:8px 0;color:var(--warning)}.garment-edge-note :deep(.ant-btn-link){padding:0;height:auto;min-height:32px}.edge-help-intro{color:var(--muted);line-height:1.7;margin-bottom:24px}.edge-guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.edge-guide{padding:16px;background:var(--surface-alt);border-radius:var(--radius-lg);display:flex;flex-direction:column;gap:16px}.edge-guide svg{display:block;width:100%;height:auto}.edge-guide h3{font-size:16px}.edge-guide p,.edge-next p{font-size:13px;line-height:1.8;color:var(--muted)}.edge-guide small{margin-top:auto;font-size:11px;color:var(--muted)}.edge-review-alert{margin:24px 0}.edge-next h3{margin-bottom:10px}.edge-help-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:24px}.edge-help-footer span{font-size:12px;color:var(--muted)}.edge-help-footer :deep(.ant-btn){min-width:140px;min-height:36px}
@media(max-width:767px){.garment-edge-note{margin-right:0}.edge-guide-grid{grid-template-columns:1fr}.edge-guide{gap:12px}.edge-guide svg{max-height:150px}.edge-help-footer{align-items:stretch;flex-direction:column}.edge-help-footer :deep(.ant-btn){width:100%}}
</style>
