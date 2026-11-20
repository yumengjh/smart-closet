import { createRouter, createWebHistory } from 'vue-router'
import { useClosetStore } from './stores/closet'
import { sessionRedirect } from './domain/session'
import { closetApi } from './services/api'
import { installRouteProgress } from './composables/useRouteProgress'
import { page } from './services/analytics'
import { legacyCreation, legacyOotd, legacyWorks } from './try/routes'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/today' },
    { path: '/today', component: () => import('./views/TodayPage.vue') },
    { path: '/vip', component: () => import('./views/VipPage.vue') },
    { path: '/try', component: () => import('./views/TryHubPage.vue') },
    { path: '/try/album', component: () => import('./views/TryAlbumPage.vue') },
    // 试穿与创作合并（server#271）：旧地址保留跳转。
    { path: '/creation', redirect: to => legacyCreation(to.query) },
    { path: '/creation/works', redirect: to => legacyWorks(to.query) },
    { path: '/ootd', redirect: to => legacyOotd(to.query) },
    { path: '/login', component: () => import('./views/LoginPage.vue') },
    { path: '/register', component: () => import('./views/RegisterPage.vue') },
    { path: '/welcome', component: () => import('./views/WelcomePage.vue') },
    { path: '/admin', component: () => import('./views/SettingsPage.vue') },
    { path: '/admin/users', component: () => import('./views/AdminUsersPage.vue') },
    { path: '/admin/security-audit', component: () => import('./views/AdminSecurityAuditPage.vue') },
    { path: '/wardrobe', component: () => import('./views/WardrobePage.vue') },
    { path: '/pending', component: () => import('./views/PendingPage.vue') },
    { path: '/tasks', component: () => import('./views/TasksPage.vue') },
    { path: '/outfits', component: () => import('./views/OutfitPage.vue') },
    { path: '/outfits/workspace', component: () => import('./views/OutfitWorkspacePage.vue') },
    { path: '/outfits/:id', component: () => import('./views/OutfitWorkspacePage.vue') },
    { path: '/try-on', component: () => import('./views/TryOnPage.vue') },
    { path: '/help', component: () => import('./views/HelpPage.vue') },
    { path: '/settings', component: () => import('./views/SettingsPage.vue') },
    { path: '/batches/:id', component: () => import('./views/BatchPage.vue') },
    { path: '/quick-add', redirect: '/add' },
    { path: '/admin/processing', component: () => import('./views/AdminProcessingPage.vue') },
    { path: '/admin/templates', component: () => import('./views/AdminTemplatesPage.vue') },
    { path: '/admin/ootd-samples', component: () => import('./views/AdminOotdSamplesPage.vue') },
    { path: '/add', component: () => import('./views/AddGarmentPage.vue') },
    { path: '/garment/:id', component: () => import('./views/GarmentPage.vue') },
    { path: '/trash', component: () => import('./views/TrashPage.vue') },
    { path: '/review', component: () => import('./views/ReviewPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/today' },
  ],
  // The wardrobe restores its own position after its list has loaded (issue #3); everything else starts at the top.
  scrollBehavior: (to) => to.path === '/wardrobe' ? false : { top: 0, behavior: 'smooth' },
})

installRouteProgress(router)

// 行为分析：重定向路由只在最终落到的页面触发一次；失败的导航不报（#279）。
router.afterEach((to, _from, failure) => { if (!failure) page(to) })

router.beforeEach(async (to) => {
  const closet = useClosetStore()
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  const portableToken = hashParams.get('portable-login')
  if (portableToken) {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    try {
      closet.user = await closetApi.consumePortableLogin(portableToken)
      await closet.refreshUser()
      return { path: to.path, query: to.query, hash: '', replace: true }
    }
    catch (cause) {
      return { path: '/login', query: { portableLink: 'error', portableError: cause instanceof Error ? cause.message : '便携登录暂时无法完成，请稍后重试。' }, replace: true }
    }
  }
  await closet.ensureUser()
  if ((to.path === '/admin' || to.path.startsWith('/admin/')) && closet.user && closet.user.role !== 'ADMIN') return '/today'
  const destination = sessionRedirect(to.path, closet.user)
  if (destination) return { ...router.resolve(destination), replace: true }
})
