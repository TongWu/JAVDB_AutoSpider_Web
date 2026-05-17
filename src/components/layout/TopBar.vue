<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NSpace, NButton, NDropdown } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useUiStore, type ThemeMode } from '@/stores/ui'
import { useLocaleStore } from '@/stores/i18n'
import { useAuthStore } from '@/stores/auth'
import type { SupportedLocale } from '@/i18n'

const { t } = useI18n()
const ui = useUiStore()
const localeStore = useLocaleStore()
const auth = useAuthStore()
const router = useRouter()

// Theme toggle
const themeIcon = computed(() => {
  if (ui.themeMode === 'light') return '☀️'
  if (ui.themeMode === 'dark') return '🌙'
  return '💻'
})

const themeLabel = computed(() => {
  if (ui.themeMode === 'light') return t('theme.light')
  if (ui.themeMode === 'dark') return t('theme.dark')
  return t('theme.system')
})

function cycleTheme() {
  const cycle: ThemeMode[] = ['light', 'dark', 'system']
  const idx = cycle.indexOf(ui.themeMode)
  ui.themeMode = cycle[(idx + 1) % cycle.length]
}

// Language switcher
const localeOptions = computed(() => [
  { label: '简体中文', key: 'zh-CN' },
  { label: 'English', key: 'en' },
  { label: '日本語', key: 'ja' },
])

function onLocaleSelect(key: string) {
  void localeStore.change(key as SupportedLocale)
}

// User menu
const userMenuOptions = computed(() => [
  { label: t('user.signOut'), key: 'signOut' },
])

async function onUserMenuSelect(key: string) {
  if (key === 'signOut') {
    await auth.logout()
    void router.push({ name: 'login' })
  }
}
</script>

<template>
  <div class="topbar">
    <div class="topbar-left">
      <!-- breadcrumbs / page title placeholder -->
    </div>
    <div class="topbar-right">
      <NSpace
        align="center"
        :size="8"
      >
        <!-- Language switcher -->
        <NDropdown
          :options="localeOptions"
          :value="localeStore.current"
          @select="onLocaleSelect"
        >
          <NButton text>
            🌐 {{ t('language.switch') }}
          </NButton>
        </NDropdown>

        <!-- Theme toggle -->
        <NButton
          text
          :title="themeLabel"
          @click="cycleTheme"
        >
          {{ themeIcon }} {{ themeLabel }}
        </NButton>

        <!-- User menu (shown when authenticated) -->
        <NDropdown
          v-if="auth.isAuthenticated"
          :options="userMenuOptions"
          @select="onUserMenuSelect"
        >
          <NButton text>
            👤 {{ auth.username }}
          </NButton>
        </NDropdown>
        <NButton
          v-else
          text
          @click="() => router.push({ name: 'login' })"
        >
          👤
        </NButton>
      </NSpace>
    </div>
  </div>
</template>

<style scoped>
.topbar {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.topbar-right {
  display: flex;
  align-items: center;
}
</style>
