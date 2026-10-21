<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { App } from 'ant-design-vue'
import { playSound } from '../../services/sound'
import { thumbUrl } from '../../services/urls'
import { presetApi, presetGroup, presetName, type AdminPreset, type PresetCoverage, type PresetStatus } from '../../services/presets'

/** 预设衣物库（管理员，设计第五节）：从账号导入草稿、核对标签、上架下架、看覆盖缺口。 */
const { message } = App.useApp()
const STATUS = [{ value: 'DRAFT', label: '草稿' }, { value: 'LISTED', label: '已上架' }, { value: 'UNLISTED', label: '已下架' }]
const GENDERS = ['女款', '男款', '中性', '未标注'].map(value => ({ value, label: value }))
const STYLES = ['都市通勤', '高智极简', '美式休闲', '户外机能', '老钱风', '潮流运动', '工装风', '日系清新', '巴恩风', '法式', '新中式', '甜美'].map(value => ({ value, label: value }))
const SEASONS = ['春', '夏', '秋', '冬'].map(value => ({ value, label: value }))

const status = ref<PresetStatus>('DRAFT'); const items = ref<AdminPreset[]>([]); const coverage = ref<PresetCoverage[]>([])
const loading = ref(false); const busy = ref(''); const error = ref(''); const username = ref('yaopinxin')

async function load() {
  loading.value = true; error.value = ''
  try { [items.value, coverage.value] = await Promise.all([presetApi.adminList(status.value), presetApi.coverage()]) }
  catch (e) { error.value = e instanceof Error ? e.message : '预设库暂时无法加载。' }
  finally { loading.value = false }
}
onMounted(load)

async function run(key: string, task: () => Promise<unknown>, done: string) {
  busy.value = key
  try { await task(); playSound('success'); message.success(done); await load() }
  catch (e) { playSound('error'); message.error(e instanceof Error ? e.message : '没有成功。') }
  finally { busy.value = '' }
}
const importDrafts = () => run('import', () => presetApi.adminImport(username.value.trim() || 'yaopinxin'), '已导入为草稿，核对后上架。')
const edit = (item: AdminPreset, patch: Parameters<typeof presetApi.adminEdit>[1]) => run(item.id, () => presetApi.adminEdit(item.id, patch), '已保存。')
const listAll = () => run('list-all', async () => { for (const item of items.value) await presetApi.adminEdit(item.id, { status: 'LISTED' }) }, '已全部上架。')

// Coverage: gender × role group rows, style columns; zeros stand out so the gaps are visible.
const styles = computed(() => [...new Set(coverage.value.map(c => c.style))])
const rows = computed(() => {
  const map = new Map<string, Record<string, number>>()
  for (const c of coverage.value) { const key = `${c.gender} · ${c.role}`; const row = map.get(key) || {}; row[c.style] = (row[c.style] || 0) + c.count; map.set(key, row) }
  return [...map.entries()].map(([key, counts]) => ({ key, counts }))
})
const groupOf = (item: AdminPreset) => presetGroup(item)
</script>

<template>
  <div class="settings-presets">
    <section class="settings-card">
      <h3>导入草稿</h3>
      <p class="muted">从指定账号的已入柜衣物生成草稿。图片只复制一份；可见文字、尺码、洗护、品牌、成分不会带走，穿着记录和反馈也不会。已上架的不会被覆盖。</p>
      <div class="settings-row"><a-input v-model:value="username" :maxlength="80" style="max-width: 220px" placeholder="账号" />
        <a-popconfirm :title="`从 ${username || 'yaopinxin'} 的衣柜导入草稿？`" ok-text="导入" cancel-text="取消" @confirm="importDrafts"><a-button type="primary" :loading="busy === 'import'">导入草稿</a-button></a-popconfirm></div>
    </section>
    <section class="settings-card">
      <div class="presets-head"><h3>预设衣物</h3><a-segmented v-model:value="status" :options="STATUS" @change="load" />
        <a-popconfirm v-if="status === 'DRAFT' && items.length" :title="`把这 ${items.length} 件草稿全部上架？`" ok-text="全部上架" cancel-text="取消" @confirm="listAll"><a-button :loading="busy === 'list-all'">全部上架</a-button></a-popconfirm></div>
      <a-alert v-if="error" type="error" show-icon :message="error" />
      <a-skeleton v-else-if="loading && !items.length" active />
      <a-empty v-else-if="!items.length" description="这里还没有预设衣物" />
      <div v-else class="presets-list">
        <article v-for="item in items" :key="item.id" class="presets-item">
          <img :src="thumbUrl(item.displayUrl, 240)" :alt="presetName(item)" loading="lazy" decoding="async" />
          <div class="presets-fields">
            <strong>{{ presetName(item) }}</strong><small class="muted">{{ groupOf(item) }} · {{ (item.fields.category || []).join('、') }}</small>
            <a-select :value="item.gender || '未标注'" :options="GENDERS" size="small" @change="(v: unknown) => edit(item, { gender: String(v) })" />
            <a-select :value="item.styles" mode="multiple" :options="STYLES" size="small" placeholder="风格方向" :max-tag-count="2" @change="(v: unknown) => edit(item, { styles: (v as string[]) })" />
            <a-select :value="item.seasons" mode="multiple" :options="SEASONS" size="small" placeholder="季节" @change="(v: unknown) => edit(item, { seasons: (v as string[]) })" />
          </div>
          <a-button v-if="item.status !== 'LISTED'" size="small" type="primary" :loading="busy === item.id" @click="edit(item, { status: 'LISTED' })">上架</a-button>
          <a-button v-else size="small" :loading="busy === item.id" @click="edit(item, { status: 'UNLISTED' })">下架</a-button>
        </article>
      </div>
    </section>
    <section class="settings-card">
      <h3>覆盖情况（已上架）</h3>
      <p class="muted">按“性别 × 位置 × 风格方向”统计，0 表示还缺这类单品。</p>
      <a-empty v-if="!rows.length" description="还没有已上架的预设衣物" />
      <div v-else class="presets-coverage"><table><thead><tr><th></th><th v-for="s in styles" :key="s">{{ s }}</th></tr></thead>
        <tbody><tr v-for="r in rows" :key="r.key"><th>{{ r.key }}</th><td v-for="s in styles" :key="s" :class="{ gap: !r.counts[s] }">{{ r.counts[s] || 0 }}</td></tr></tbody></table></div>
    </section>
  </div>
</template>

<style scoped>
.presets-head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 12px; }
.presets-head h3 { margin: 0; }
.presets-list { display: grid; gap: 10px; }
.presets-item { display: grid; grid-template-columns: 72px 1fr auto; gap: 12px; align-items: center; padding: 8px; border: 1px solid var(--line); border-radius: 12px; }
.presets-item img { width: 72px; height: 72px; object-fit: contain; background: var(--surface-alt); border-radius: 8px; }
.presets-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; align-items: center; }
.presets-fields strong, .presets-fields small { grid-column: 1 / -1; }
.presets-coverage { overflow-x: auto; }
.presets-coverage table { border-collapse: collapse; font-size: 12px; }
.presets-coverage th, .presets-coverage td { padding: 4px 8px; border: 1px solid var(--line); text-align: center; white-space: nowrap; }
.presets-coverage td.gap { color: var(--danger, #c0392b); font-weight: 600; }
@media (max-width: 640px) { .presets-item { grid-template-columns: 56px 1fr; } .presets-item img { width: 56px; height: 56px; } .presets-item > .ant-btn { grid-column: 1 / -1; } }
</style>
