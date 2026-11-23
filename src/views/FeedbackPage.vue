<script setup lang="ts">
// 意见反馈（/feedback，server 设计 2026-11-23-用户反馈 9.1 节）。没登录时套登录页外框（ClosetShell 不显示导航），
// 已登录时是普通页面，下面列出“我的反馈”（只含附带账号的）与回复。?from= 是打开它的页面的路由模板。
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import PageTitle from '../shell/PageTitle.vue'
import FeedbackForm from '../feedback/FeedbackForm.vue'
import { useClosetStore } from '../stores/closet'
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUS_LABEL, feedbackApi, feedbackError, feedbackPage, type FeedbackOptions, type MyFeedback } from '../services/feedback'

const closet = useClosetStore(); const route = useRoute(); const router = useRouter()
const signedIn = computed(() => closet.isSignedIn)
const options = ref<FeedbackOptions | null>(null)
const loadError = ref('')
const page = computed(() => feedbackPage(route.query.from))

const mine = ref<MyFeedback[]>([])
const mineTotal = ref(0)
const mineLoading = ref(false)
const mineError = ref('')
async function loadMine() {
  if (!signedIn.value) return
  mineLoading.value = true; mineError.value = ''
  try { const result = await feedbackApi.mine(1, 50); mine.value = result.items; mineTotal.value = result.total }
  catch (cause) { mineError.value = feedbackError(cause) }
  finally { mineLoading.value = false }
}
onMounted(async () => {
  try { options.value = await feedbackApi.options() } catch (cause) { loadError.value = feedbackError(cause) }
  void loadMine()
})

const categoryLabel = (value: MyFeedback['category']) => FEEDBACK_CATEGORIES.find(c => c.value === value)?.label ?? ''
const dateText = (ms: number) => new Date(ms).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
const statusColor = (status: MyFeedback['status']) => status === 'RESOLVED' ? 'success' : status === 'PROCESSING' ? 'processing' : 'default'
</script>

<template>
  <AuthShell v-if="!signedIn" compact-art eyebrow="意见反馈" title="告诉我们哪里不顺" intro="没登录也能反馈，比如登不上、注册不了、邀请码用不了。">
    <div class="fb-anon">
      <a-alert v-if="loadError" type="error" :message="loadError" show-icon />
      <a-skeleton v-else-if="!options" active :paragraph="{ rows: 4 }" />
      <a-empty v-else-if="!options.enabled" description="反馈暂未开放" />
      <div v-else-if="!options.anonymousEnabled" class="fb-closed">
        <a-alert type="info" message="现在要登录后才能反馈。" show-icon />
        <a-button type="primary" size="large" block @click="router.push('/login')">去登录</a-button>
      </div>
      <FeedbackForm v-else :signed-in="false" :page="page ?? '/login'" :max-length="options.maxLength">
        <template #done="{ again }"><a-button type="primary" @click="router.push('/login')">返回登录</a-button><a-button type="text" @click="again">再写一条</a-button></template>
      </FeedbackForm>
    </div>
    <template #footer><RouterLink to="/login">返回登录</RouterLink></template>
  </AuthShell>

  <div v-else class="fb-page">
    <PageTitle title="意见反馈" />
    <a-alert v-if="loadError" type="error" :message="loadError" show-icon />
    <a-skeleton v-else-if="!options" active :paragraph="{ rows: 5 }" />
    <a-empty v-else-if="!options.enabled" description="反馈暂未开放" />
    <section v-else class="fb-card">
      <FeedbackForm :signed-in="true" :page="page" :max-length="options.maxLength" @sent="loadMine" />
    </section>

    <section v-if="options?.enabled" class="fb-mine" aria-labelledby="fb-mine-title">
      <h2 id="fb-mine-title">我的反馈<small v-if="mineTotal">{{ mineTotal }}</small></h2>
      <a-alert v-if="mineError" type="error" :message="mineError" show-icon />
      <a-skeleton v-else-if="mineLoading && !mine.length" active :paragraph="{ rows: 2 }" />
      <p v-else-if="!mine.length" class="fb-empty">附带账号发出的反馈和回复会出现在这里。</p>
      <ul v-else class="fb-list">
        <li v-for="item in mine" :key="item.id" class="fb-item">
          <header><a-tag :bordered="false" :color="statusColor(item.status)">{{ FEEDBACK_STATUS_LABEL[item.status] }}</a-tag><span>{{ categoryLabel(item.category) }} · {{ dateText(item.createdAtMs) }}</span></header>
          <p class="fb-text">{{ item.content }}</p>
          <div v-if="item.reply" class="fb-reply"><strong>鱼搭回复</strong><p>{{ item.reply }}</p></div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.fb-anon { margin-top: 24px; }
.fb-closed { display: grid; gap: 14px; }
.fb-page { max-width: 640px; margin: 0 auto; padding-bottom: 24px; }
.fb-card { padding: 16px; border-radius: 16px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.fb-mine { margin-top: 24px; }
.fb-mine h2 { display: flex; align-items: baseline; gap: 6px; margin: 0 0 10px 4px; font-size: 15px; font-weight: 600; }
.fb-mine h2 small { color: var(--muted); font-size: 12px; font-weight: 400; }
.fb-empty { margin: 0 4px; color: var(--muted); font-size: 13px; }
.fb-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.fb-item { padding: 12px 14px; border-radius: 14px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }
.fb-item header { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.fb-item header .ant-tag { margin: 0; }
.fb-text { display: -webkit-box; margin: 8px 0 0; overflow: hidden; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; }
.fb-reply { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: var(--surface-alt); }
.fb-reply strong { font-size: 12px; font-weight: 600; }
.fb-reply p { margin: 4px 0 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
@media (max-width: 767px) { .fb-card { padding: 14px; } }
</style>
