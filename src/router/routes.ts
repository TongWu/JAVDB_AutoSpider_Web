import type { RouteRecordRaw } from 'vue-router'
import type { Role } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'blank' | 'default'
    requiresAuth?: boolean
    roles?: Role[]
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { layout: 'blank' },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/run',
    name: 'run',
    component: () => import('@/pages/RunPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/404',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: { layout: 'blank' },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/pages/ForbiddenPage.vue'),
    meta: { layout: 'blank' },
  },
  {
    path: '/error',
    name: 'error',
    component: () => import('@/pages/ErrorPage.vue'),
    meta: { layout: 'blank' },
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('@/pages/TasksPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/sessions',
    name: 'sessions',
    component: () => import('@/pages/SessionsPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/browse',
    name: 'browse',
    component: () => import('@/pages/BrowsePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings',
    component: () => import('@/components/settings/SettingsLayout.vue'),
    meta: { requiresAuth: true },
    redirect: '/settings/config',
    children: [
      {
        path: 'config',
        name: 'settings-config',
        component: () => import('@/pages/settings/SettingsConfigPage.vue'),
      },
      {
        path: 'auth',
        name: 'settings-auth',
        component: () => import('@/pages/settings/SettingsAuthPage.vue'),
      },
      {
        path: 'capabilities',
        name: 'settings-capabilities',
        component: () => import('@/pages/settings/SettingsCapabilitiesPage.vue'),
      },
      {
        path: 'appearance',
        name: 'settings-appearance',
        component: () => import('@/pages/settings/SettingsAppearancePage.vue'),
      },
    ],
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/pages/OnboardingPage.vue'),
    meta: { requiresAuth: true, layout: 'blank' },
  },
  {
    path: '/data/movies',
    name: 'data-movies',
    component: () => import('@/pages/data/MoviesPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/data/torrents',
    name: 'data-torrents',
    component: () => import('@/pages/data/TorrentsPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/ops/qb',
    name: 'ops-qb',
    component: () => import('@/pages/operations/QBittorrentPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/ops/pikpak',
    name: 'ops-pikpak',
    component: () => import('@/pages/operations/PikPakPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/ops/rclone',
    name: 'ops-rclone',
    component: () => import('@/pages/operations/RclonePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/ops/email',
    name: 'ops-email',
    component: () => import('@/pages/operations/EmailPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/ops/cleanup',
    name: 'ops-cleanup',
    component: () => import('@/pages/operations/CleanupPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/gh-actions',
    name: 'gh-actions-runs',
    component: () => import('@/pages/gh-actions/RunsPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/diag/health',
    name: 'diag-health',
    component: () => import('@/pages/diagnostics/HealthPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/diag/parse',
    name: 'diag-parse',
    component: () => import('@/pages/diagnostics/ParseTesterPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/diag/javdb',
    name: 'diag-javdb',
    component: () => import('@/pages/diagnostics/JavdbSessionPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
]
