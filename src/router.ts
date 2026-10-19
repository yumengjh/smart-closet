import { createRouter, createWebHistory } from 'vue-router'
import { useClosetStore } from './stores/closet'
import { sessionRedirect } from './domain/session'
import { closetApi } from './services/api'
import { installRouteProgress } from './composables/useRouteProgress'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/wardrobe' },
    { path: '/login', component: () => import('./views/LoginPage.vue') },
    { path: '/register', component: () => import('./views/RegisterPage.vue') },
    { path: '/admin/users', component: () => import('./views/AdminUsersPage.vue') },
    { path: '/wardrobe', component: () => import('./views/WardrobePage.vue') },
    { path: '/pending', component: () => import('./views/PendingPage.vue') },
    { path: '/tasks', component: () => import('./views/TasksPage.vue') },
    { path: '/outfits', component: () => import('./views/OutfitPage.vue') },
    { path: '/outfits/workspace', component: () => import('./views/OutfitWorkspacePage.vue') },
    { path: '/outfits/:id', component: () => import('./views/OutfitWorkspacePage.vue') },
    { path: '/ootd', component: () => import('./views/OotdPage.vue') },
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
    { path: '/:pathMatch(.*)*', redirect: '/wardrobe' },
  ],
  // The wardrobe restores its own position after its list has loaded (issue #3); everything else starts at the top.
  scrollBehavior: (to) => to.path === '/wardrobe' ? false : { top: 0, behavior: 'smooth' },
})

installRouteProgress(router)

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
  if (to.path.startsWith('/admin/') && closet.user && closet.user.role !== 'ADMIN') return '/wardrobe'
  const destination = sessionRedirect(to.path, closet.user)
  if (destination) return { ...router.resolve(destination), replace: true }
})
