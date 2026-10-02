import { createRouter, createWebHistory } from 'vue-router'
import { useClosetStore } from './stores/closet'
import { sessionRedirect } from './domain/session'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/wardrobe' },
    { path: '/login', component: () => import('./views/LoginPage.vue') },
    { path: '/wardrobe', component: () => import('./views/WardrobePage.vue') },
    { path: '/pending', component: () => import('./views/PendingPage.vue') },
    { path: '/tasks', component: () => import('./views/TasksPage.vue') },
    { path: '/outfits', component: () => import('./views/OutfitPage.vue') },
    { path: '/outfits/workspace', component: () => import('./views/OutfitWorkspacePage.vue') },
    { path: '/outfits/:id', component: () => import('./views/OutfitWorkspacePage.vue') },
    { path: '/help', component: () => import('./views/HelpPage.vue') },
    { path: '/settings', component: () => import('./views/SettingsPage.vue') },
    { path: '/add', component: () => import('./views/AddGarmentPage.vue') },
    { path: '/garment/:id', component: () => import('./views/GarmentPage.vue') },
    { path: '/trash', component: () => import('./views/TrashPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/wardrobe' },
  ],
  scrollBehavior: () => ({ top: 0, behavior: 'smooth' }),
})

router.beforeEach(async (to) => {
  const closet = useClosetStore()
  await closet.ensureUser()
  const destination = sessionRedirect(to.path, closet.user)
  if (destination) return { ...router.resolve(destination), replace: true }
})
