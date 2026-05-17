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
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
]
