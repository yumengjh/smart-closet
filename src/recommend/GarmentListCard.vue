<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import GarmentThumb from './GarmentThumb.vue'

/**
 * 衣物清单卡（issue #8）：the assistant counted garments with closet_summary and the user asked to see them. The list is
 * the exact matching set from the server (at most 60), each opens its garment page.
 */
type Item = { id: string; name?: string; category?: string[]; primaryColor?: string[] }
const props = defineProps<{ payload: { items?: Item[]; total?: number; truncated?: boolean } }>()
const expanded = ref(false)
const items = computed(() => props.payload.items || [])
const shown = computed(() => expanded.value ? items.value : items.value.slice(0, 12))
const label = (g: Item) => g.name || `${g.primaryColor?.[0] || ''}${g.category?.[0] || '衣物'}`
</script>
<template>
  <section class="garment-choice garment-list-card" aria-label="衣物清单">
    <small class="muted">共 {{ payload.total ?? items.length }} 件<template v-if="payload.truncated">，这里列出前 {{ items.length }} 件</template>，点开查看：</small>
    <div class="garment-choice-options">
      <RouterLink v-for="g in shown" :key="g.id" :to="`/garment/${g.id}`" custom v-slot="{ navigate }">
        <a-button :title="label(g)" @click="navigate"><GarmentThumb :garment-id="g.id" :alt="label(g)" :size="64" /><span>{{ label(g) }}</span></a-button>
      </RouterLink>
    </div>
    <a-button v-if="items.length > 12" type="link" size="small" @click="expanded = !expanded">{{ expanded ? '收起' : `展开全部 ${items.length} 件` }}</a-button>
  </section>
</template>
