<script setup lang="ts">
// 上身图“更多”（原上身图页“穿法与更多”，server#271 放进“谁来穿”这一步）：姿势、这次穿哪些、多层、穿法细节、
// 补充说明、生成模型，以及只检查、模拟一次、管理我的形象。规则不变。
import { RightOutlined } from '@ant-design/icons-vue'
import { DETAIL_OPTIONS, type OotdStudio } from './useOotdStudio'

defineProps<{ studio: OotdStudio }>()
const emit = defineEmits<{ pose: [] }>()
</script>

<template>
  <div class="ootd-more">
    <button type="button" class="ootd-more-row" @click="emit('pose')"><span>姿势</span><b>{{ studio.poseName }}</b><RightOutlined /></button>
    <template v-if="studio.current">
      <p class="ootd-more-label">这次穿哪些</p>
      <a-checkbox-group v-model:value="studio.selected" class="ootd-more-selections"><a-checkbox v-for="g in studio.garments" :key="g.garmentId" :value="g.garmentId">{{ g.garmentLabel }}</a-checkbox></a-checkbox-group>
      <a-checkbox v-model:checked="studio.multiLayer">多层穿法（打底 + 主体 + 外搭）</a-checkbox>
      <div v-if="studio.multiLayer" class="ootd-more-roles"><div v-for="g in studio.garments.filter(g => studio.selected.includes(g.garmentId))" :key="g.garmentId"><span>{{ g.garmentLabel }}</span><a-select v-model:value="studio.wearRoles[g.garmentId]" allow-clear :options="[{ value: 'INNER', label: '打底内层' }]" placeholder="按品类判断" /></div></div>
      <template v-if="studio.detailGarments.length">
        <p class="ootd-more-label">穿法细节 <small>只影响这张图，不改搭配</small></p>
        <div v-for="g in studio.detailGarments" :key="g.garmentId" class="ootd-more-detail">
          <span>{{ g.garmentLabel }}<a-tag v-if="studio.suggested[g.garmentId]" :bordered="false">建议</a-tag></span>
          <a-select v-for="d in DETAIL_OPTIONS[g.role]" :key="d.key" size="small" class="ootd-more-select" :aria-label="`${g.garmentLabel}${d.label}`" :value="studio.detail(g.garmentId, d.key)" :options="d.options.map(o => ({ value: o.value, label: `${d.label}：${o.label}` }))" @update:value="(v: string) => studio.setDetail(g.garmentId, d.key, v)" />
        </div>
      </template>
      <a-textarea v-model:value="studio.wearNote" :maxlength="200" show-count :auto-size="{ minRows: 1, maxRows: 3 }" placeholder="补充说明，例如：衬衫领口解开一颗扣子" aria-label="穿法补充说明" />
    </template>
    <template v-if="studio.available.length > 1"><p class="ootd-more-label">生成模型</p><a-select v-model:value="studio.model" class="ootd-more-full" aria-label="生成模型" :options="studio.available.map(c => ({ value: c.provider + ':' + c.model, label: c.model }))" /></template>
    <div class="ootd-more-actions">
      <a-button size="small" :disabled="!studio.current || studio.busy" @click="studio.moreAction('check')">只检查这套能不能生成</a-button>
      <a-button size="small" @click="studio.moreAction('rehearse')">模拟一次（不花额度）</a-button>
      <a-button size="small" type="text" @click="studio.moreAction('manage')">管理我的形象</a-button>
    </div>
  </div>
</template>

<style scoped>
.ootd-more { display: grid; gap: 10px; }
.ootd-more-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 2px; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--ink); cursor: pointer; font: inherit; text-align: left; }
.ootd-more-row:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.ootd-more-row > span { flex: none; font-size: 14px; }
.ootd-more-row > b { flex: 1; min-width: 0; overflow: hidden; font-size: 14px; font-weight: 400; color: var(--muted); text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.ootd-more-row > .anticon { flex: none; font-size: 12px; color: var(--muted-subtle); }
.ootd-more-label { margin: 6px 0 0; font-size: 13px; font-weight: 600; }
.ootd-more-label small { margin-left: 6px; font-weight: 400; color: var(--muted); }
.ootd-more-selections { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; width: 100%; }
.ootd-more-selections :deep(.ant-checkbox-wrapper) { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--surface-alt); }
.ootd-more-roles > div { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.ootd-more-roles :deep(.ant-select) { min-width: 180px; }
.ootd-more-detail { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.ootd-more-detail > span { flex: 1 1 100%; font-size: 13px; }
.ootd-more-select { min-width: 132px; }
.ootd-more-full { width: 100%; }
.ootd-more-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
</style>
