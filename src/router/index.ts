import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Placeholder for B3-B4 auth/capabilities guards
router.beforeEach((to, _from, next) => {
  // Real auth guard lands in B3. For now, just allow.
  void to
  next()
})

export default router
