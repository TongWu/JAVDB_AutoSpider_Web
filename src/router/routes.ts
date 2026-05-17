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
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
]
