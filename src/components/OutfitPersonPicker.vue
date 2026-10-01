<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PersonCatalog, PersonPart } from '../domain/person-stickers'
const props = defineProps<{ catalog: PersonCatalog | null; loading: boolean; error: string; mobile?: boolean }>()
const emit = defineEmits<{ select: [part: PersonPart]; dragstart: [event: DragEvent, part: PersonPart]; dragend: []; retry: [] }>()
const selectedSet = ref('chibi')
const loose = ref('sets')
const search = ref('')
const parts = computed(() => (loose.value === 'loose' ? props.catalog?.sets.flatMap(set => set.parts.filter(part => part.loose).map(part => ({ ...part, label: `${set.label} · ${part.label}` }))) : props.catalog?.sets.find(set => set.id === selectedSet.value)?.parts)?.filter(part => part.label.includes(search.value.trim())) || [])
</script>
<template>
  <div class="outfit-person-picker">
    <a-alert v-if="error" type="error" :message="error"><template #action><a-button @click="emit('retry')">重试</a-button></template></a-alert>
    <a-spin v-if="loading" />
    <template v-else-if="catalog">
      <a-segmented v-model:value="loose" block :options="[{ label: '角色套装', value: 'sets' }, { label: '零散部位', value: 'loose' }]" />
      <a-select v-if="loose === 'sets'" v-model:value="selectedSet" aria-label="人物套装" :options="catalog.sets.map(set => ({ value: set.id, label: set.label }))" />
      <a-input v-model:value="search" allow-clear placeholder="搜索人物部位" aria-label="搜索人物部位" />
      <p class="outfit-panel-description">逐件{{ mobile ? '点选' : '点选或拖入' }}，每张贴纸都能自由调整和重复添加。</p>
      <div class="outfit-person-grid">
        <button v-for="part in parts" :key="part.id" type="button" class="outfit-person-part" :draggable="!mobile" @click="emit('select', part)" @dragstart="emit('dragstart', $event, part)" @dragend="emit('dragend')">
          <img :src="part.url" :alt="part.label" draggable="false" /><span>{{ part.label }}</span>
        </button>
      </div>
      <a-empty v-if="!parts.length" description="没有找到这个部位" />
    </template>
  </div>
</template>
