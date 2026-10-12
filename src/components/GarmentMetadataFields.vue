<script setup lang="ts">
import { RollbackOutlined, InfoCircleOutlined } from '@ant-design/icons-vue'
import { metadataChoices, matchesMetadataOption, type MetadataField } from '../domain/metadata'
import type { Garment } from '../services/api'
defineProps<{ schema: MetadataField[]; values: Record<string, string[]>; garment: Garment; resetFields: string[]; disabled: boolean }>()
defineEmits<{ edit: [key: string, value: string[]]; restore: [key: string] }>()
function serverValue(garment: Garment, key: string) {
  const value = (garment as unknown as Record<string, unknown>)[key]
  return Array.isArray(value) && value.length ? value.join('、') : '未知'
}
</script>
<template>
  <div class="metadata-fields">
    <div v-for="field in schema" :key="field.key" class="metadata-field">
      <div class="metadata-label"><label :for="`field-${field.key}`">{{ field.label }}</label><a-popover :trigger="['hover','click']" :title="field.label"><template #content><p class="field-evidence">服务端当前值：{{ serverValue(garment,field.key) }}</p><p class="field-evidence">{{ garment.metadataEvidence?.[field.key]?.evidence || '未知可以留空，可根据实物填写。' }}</p><a-button v-if="Object.hasOwn(garment.overrides,field.key) || resetFields.includes(field.key)" :disabled="disabled" @click="$emit('restore',field.key)"><RollbackOutlined /> 恢复自动值</a-button></template><a-button type="text" :aria-label="`${field.label}的依据与自动值`"><InfoCircleOutlined /></a-button></a-popover></div>
      <a-select v-if="field.multiple" :id="`field-${field.key}`" :aria-label="field.label" :value="values[field.key] || []" mode="tags" :options="metadataChoices(field,values[field.key] || [])" :disabled="disabled" allow-clear show-search placeholder="选择或输入，回车添加" @update:value="$emit('edit',field.key,Array.isArray($event) ? $event.map(String) : [])" />
      <a-auto-complete v-else-if="field.options.length" :id="`field-${field.key}`" :aria-label="field.label" :value="values[field.key]?.[0] || ''" :options="metadataChoices(field,values[field.key] || [])" :filter-option="matchesMetadataOption" :disabled="disabled" allow-clear @update:value="$emit('edit',field.key,$event ? [String($event)] : [])"><a-input :maxlength="400" placeholder="选择或填写，未知可留空" /></a-auto-complete>
      <a-input v-else :id="`field-${field.key}`" :aria-label="field.label" :value="values[field.key]?.[0] || ''" :disabled="disabled" :maxlength="400" placeholder="未知，可留空" @update:value="$emit('edit',field.key,$event ? [$event] : [])" />
      <small v-if="field.suggestion">{{ garment.overrides[field.key]?.length ? '用户核对值' : garment.automatic[field.key]?.length ? '照片建议，需核对' : '未知，可留空' }}</small>
    </div>
  </div>
</template>
<style scoped>
.metadata-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.metadata-field{display:flex;flex-direction:column;gap:8px;min-width:0}.metadata-label{min-height:44px;align-items:center;display:flex;justify-content:space-between;gap:4px;font-size:13px;color:var(--muted-copy)}.metadata-label :deep(.ant-btn){width:36px;height:36px;min-height:36px;padding:0;flex:none}.metadata-label label{overflow-wrap:anywhere}.metadata-field :deep(.ant-select-selector),.metadata-field :deep(.ant-input){min-height:44px}.metadata-field small{font-size:12px;color:var(--muted-copy);line-height:1.7}.field-evidence{max-width:320px;font-size:14px;line-height:1.8;margin-bottom:12px}
@media(max-width:480px){.metadata-fields{grid-template-columns:1fr;gap:16px}}
</style>
