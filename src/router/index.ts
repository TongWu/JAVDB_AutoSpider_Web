import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  // Lazy-import to avoid SSR-style initialization order issues
  const { useAuthStore } = await import('@/stores/auth')
  const auth = useAuthStore()

  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth)
  if (requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { next: to.fullPath } }
  }

  const requiredRoles = to.meta.roles as string[] | undefined
  if (requiredRoles && requiredRoles.length > 0 && !auth.hasRole(requiredRoles as never)) {
    return { name: 'forbidden' }
  }

  return true
})

export default router
