<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NTabs, NTabPane, NMessageProvider } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const TABS = [
  { key: 'config', path: '/settings/config' },
  { key: 'auth', path: '/settings/auth' },
  { key: 'capabilities', path: '/settings/capabilities' },
  { key: 'appearance', path: '/settings/appearance' },
] as const

type TabKey = typeof TABS[number]['key']

const active = computed<TabKey>(() => {
  for (const tab of TABS) {
    if (route.path.startsWith(tab.path)) return tab.key
  }
  return 'config'
})

function onTab(key: string): void {
  const target = TABS.find((t) => t.key === key)
  if (target && route.path !== target.path) void router.push(target.path)
}
</script>

<template>
  <NMessageProvider>
    <div class="settings-layout">
      <header class="page-header">
        <h1>{{ t('nav.settings') }}</h1>
        <p class="subtitle">
          {{ t('settings.subtitle') }}
        </p>
      </header>

      <NTabs
        :value="active"
        type="line"
        animated
        @update:value="onTab"
      >
        <NTabPane
          name="config"
          :tab="t('nav.config')"
        />
        <NTabPane
          name="auth"
          :tab="t('nav.auth')"
        />
        <NTabPane
          name="capabilities"
          :tab="t('nav.capabilities')"
        />
        <NTabPane
          name="appearance"
          :tab="t('nav.appearance')"
        />
      </NTabs>

      <router-view />
    </div>
  </NMessageProvider>
</template>

<style scoped>
.settings-layout { display: flex; flex-direction: column; gap: 16px; }
.page-header h1 { margin: 0; font-size: 22px; font-weight: 700; }
.subtitle { color: var(--n-text-color-2); font-size: 13px; margin-top: 4px; }
</style>
