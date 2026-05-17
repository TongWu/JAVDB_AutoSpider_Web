<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NSkeleton, NSpace } from 'naive-ui'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingStore } from '@/stores/onboarding'
import { apiHealth } from '@/api/health'
import OutageScreen from './OutageScreen.vue'

const router = useRouter()
const cap = useCapabilitiesStore()
const auth = useAuthStore()

const loading = ref(true)
const showOutage = ref(false)

async function boot() {
  // Don't gate the public /login route; the unauthenticated visitor
  // should be able to reach the login form without a capabilities call.
  if (!auth.isAuthenticated) {
    loading.value = false
    return
  }

  loading.value = true
  showOutage.value = false
  try {
    await Promise.all([cap.fetchInitial(), apiHealth()])
    // Auto-redirect to onboarding for fresh users
    try {
      const onboarding = useOnboardingStore()
      const status = await onboarding.fetchStatus()
      if (!status.completed && auth.isAuthenticated) {
        const currentName = router.currentRoute.value.name
        if (currentName !== 'onboarding' && currentName !== 'login') {
          void router.replace({ name: 'onboarding' })
        }
      }
    } catch (err) {
      // If onboarding status fails, log and continue — don't block boot.
      console.error('Onboarding status fetch failed:', err)
    }
    loading.value = false
  } catch (err) {
    console.error('Boot gate failed:', err)
    // Distinguish capabilities vs health failure: if cap.error is set,
    // it's a capabilities problem (probably misconfigured backend). If
    // not, health failed → show outage screen.
    if (cap.error) {
      void router.replace({ name: 'error' })
    } else {
      showOutage.value = true
      loading.value = false
    }
  }
}

async function retry() {
  await boot()
}

onMounted(boot)
</script>

<template>
  <template v-if="loading">
    <div class="boot-skeleton" data-testid="capabilities-boot">
      <NSpace vertical size="large" style="padding: 24px;">
        <NSkeleton height="48px" />
        <NSpace>
          <NSkeleton :width="240" height="100vh" />
          <NSkeleton height="200px" style="flex: 1;" />
        </NSpace>
      </NSpace>
    </div>
  </template>
  <template v-else-if="showOutage">
    <OutageScreen @retry="retry" />
  </template>
  <template v-else>
    <slot />
  </template>
</template>
