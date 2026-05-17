<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { NConfigProvider, NMessageProvider, NDialogProvider, darkTheme } from 'naive-ui'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { usePreferredDark } from '@vueuse/core'
import { lightTheme as lightOverrides, darkTheme as darkOverrides } from '@/theme'
import AppShell from '@/components/layout/AppShell.vue'
import CapabilitiesGate from '@/components/CapabilitiesGate.vue'

const route = useRoute()
const ui = useUiStore()
const preferredDark = usePreferredDark()

const isDark = computed(() => {
  if (ui.themeMode === 'system') return preferredDark.value
  return ui.themeMode === 'dark'
})

const theme = computed(() => (isDark.value ? darkTheme : null))
const themeOverrides = computed(() => (isDark.value ? darkOverrides : lightOverrides))

watchEffect(() => {
  document.documentElement.classList.toggle('dark', isDark.value)
})

const layout = computed(() => (route.meta.layout === 'blank' ? 'blank' : 'shell'))
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <NMessageProvider>
      <NDialogProvider>
        <CapabilitiesGate>
          <AppShell v-if="layout === 'shell'">
            <RouterView />
          </AppShell>
          <RouterView v-else />
        </CapabilitiesGate>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
