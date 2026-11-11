<script setup lang="ts">
// 试穿入口（ToC 改版（二）3.1）：上身效果图（原 OOTD 页）与实时试穿合成一个入口。
// 没有实时试穿权限时不显示切换，直接是上身效果图；实时试穿仍是现有的全屏页 /try-on。
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VideoCameraOutlined } from '@ant-design/icons-vue'
import OotdPage from './OotdPage.vue'
import PageTitle from '../shell/PageTitle.vue'
import { tryOnAccess } from '../tryon/access'

const route = useRoute(), router = useRouter()
const liveAvailable = computed(() => Boolean(tryOnAccess.value?.enabled))
const mode = computed<'image' | 'live'>({
  get: () => liveAvailable.value && route.query.mode === 'live' ? 'live' : 'image',
  set: value => { void router.replace({ query: { ...route.query, mode: value === 'live' ? 'live' : undefined } }) },
})
</script>

<template>
  <div class="try-hub">
    <div v-if="liveAvailable" class="try-hub-switch">
      <a-segmented v-model:value="mode" block size="large" :options="[{ value: 'image', label: '上身效果图' }, { value: 'live', label: '实时试穿' }]" aria-label="试穿方式" />
    </div>
    <template v-if="mode === 'live'">
      <PageTitle title="实时试穿" />
      <section class="try-live">
        <div class="try-live-frame" aria-hidden="true"><VideoCameraOutlined /></div>
        <h2>对着镜头，换上衣柜里的衣服</h2>
        <p>打开前置或后置镜头，选一件就能实时看到上身效果，可以随时停下。</p>
        <a-button type="primary" size="large" block class="try-live-go" @click="router.push('/try-on')"><VideoCameraOutlined /> 打开镜头</a-button>
      </section>
    </template>
    <OotdPage v-else />
  </div>
</template>

<style scoped>
.try-hub-switch { max-width: 520px; margin: 4px auto 16px; padding: 0 16px; }
.try-hub-switch :deep(.ant-segmented) { padding: 4px; border-radius: 999px; }
.try-hub-switch :deep(.ant-segmented-item) { border-radius: 999px; }
.try-live { position: relative; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; max-width: 560px; min-height: 420px; margin: 0 auto; padding: 24px; overflow: hidden; border-radius: 30px; color: #fff; background: linear-gradient(160deg, #3a2a22, #15110e); }
.try-live-frame { position: absolute; inset: 20px 20px 170px; display: grid; place-items: center; border: 2px dashed #ffffff40; border-radius: 22px; color: #ffffff4d; font-size: 56px; }
.try-live h2 { position: relative; margin: 0; font-size: 22px; }
.try-live-go.ant-btn, html .try-live-go.ant-btn:hover { position: relative; color: #fff; background: var(--brand); }
.try-live p { position: relative; margin: 0 0 12px; color: #ffffffb3; font-size: 14px; }
</style>
