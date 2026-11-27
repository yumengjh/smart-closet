import { computed, ref } from 'vue'
import { App } from 'ant-design-vue'
import { getRenderTiers, putModelTiers, renderTierAvailable, type RenderTiers, type Tier } from '../services/modelTiers'

/** The portrait dialog and the studio both need a confirmed account preference before preparing a new image. */
export function useRenderTiers() {
  const { message } = App.useApp()
  const renderTiers = ref<RenderTiers | null>(null), tier = ref<Tier>('STANDARD')
  const tierLoading = ref(false), tierError = ref(false), tierSaving = ref(false)
  let pending: Promise<void> | undefined
  function apply(config: RenderTiers) { renderTiers.value = config; tier.value = config.selected }
  function loadTiers() {
    if (pending) return pending
    tierLoading.value = true; tierError.value = false
    pending = getRenderTiers().then(apply).catch(() => {
      renderTiers.value = null; tierError.value = true
    }).finally(() => { tierLoading.value = false; pending = undefined })
    return pending
  }
  function selectTier(value: Tier) {
    if (pending || value === tier.value) return
    tierSaving.value = true
    pending = putModelTiers({ render: value }).then(result => apply(result.render)).catch(cause => {
      message.error(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { tierSaving.value = false; pending = undefined })
    return pending
  }
  const tierBlocked = computed(() => tierLoading.value || !renderTiers.value || (renderTiers.value.enabled && !renderTierAvailable(renderTiers.value, tier.value)))
  return { renderTiers, tier, tierLoading, tierError, tierSaving, tierBlocked, loadTiers, selectTier }
}
