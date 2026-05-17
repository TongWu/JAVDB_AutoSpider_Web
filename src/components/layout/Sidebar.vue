<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NMenu } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type { MenuOption } from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import { useCapabilitiesStore } from '@/stores/capabilities'

const { t } = useI18n()
const router = useRouter()
const ui = useUiStore()
const cap = useCapabilitiesStore()

const options = computed<MenuOption[]>(() => {
  const ghTier = cap.data?.gh_actions?.tier ?? null
  const features = cap.data?.features ?? null

  const items: MenuOption[] = [
    { label: t('nav.home'), key: 'home', icon: () => '🏠' },
    { label: t('nav.run'), key: 'run', icon: () => '⚡' },
    {
      label: t('nav.activity'),
      key: 'activity',
      icon: () => '📋',
      children: [
        { label: t('nav.tasks'), key: 'tasks' },
        { label: t('nav.sessions'), key: 'sessions' },
      ],
    },
    { label: t('nav.browse'), key: 'browse', icon: () => '🌐' },
    {
      label: t('nav.data'),
      key: 'data',
      icon: () => '🗃️',
      children: [
        { label: t('nav.movies'), key: 'movies' },
        { label: t('nav.torrents'), key: 'torrents' },
      ],
    },
  ]

  // Operations group: always shown; individual children hidden by feature flags
  const opsChildren: MenuOption[] = [
    { label: t('nav.qbittorrent'), key: 'qbittorrent' },
  ]
  if (!features || features.pikpak) {
    opsChildren.push({ label: t('nav.pikpak'), key: 'pikpak' })
  }
  if (!features || features.rclone) {
    opsChildren.push({ label: t('nav.rclone'), key: 'rclone' })
  }
  if (!features || features.smtp) {
    opsChildren.push({ label: t('nav.email'), key: 'email' })
  }
  opsChildren.push({ label: t('nav.cleanup'), key: 'cleanup' })

  items.push({
    label: t('nav.operations'),
    key: 'operations',
    icon: () => '⚙️',
    children: opsChildren,
  })

  // Diagnostics: always shown
  items.push({
    label: t('nav.diagnostics'),
    key: 'diagnostics',
    icon: () => '🔍',
    children: [
      { label: t('nav.health'), key: 'health' },
      { label: t('nav.parseTester'), key: 'parseTester' },
      { label: t('nav.javdbSession'), key: 'javdbSession' },
    ],
  })

  // GitHub Actions group: hidden when tier === 'none'
  if (ghTier === null || ghTier !== 'none') {
    items.push({
      label: t('nav.githubActions'),
      key: 'githubActions',
      icon: () => '🚀',
      children: [
        { label: t('nav.runs'), key: 'runs' },
        { label: t('nav.workflows'), key: 'workflows' },
        { label: t('nav.secrets'), key: 'secrets' },
      ],
    })
  }

  items.push({
    label: t('nav.settings'),
    key: 'settings',
    icon: () => '🔧',
    children: [
      { label: t('nav.config'), key: 'config' },
      { label: t('nav.auth'), key: 'auth' },
      { label: t('nav.capabilities'), key: 'capabilities' },
      { label: t('nav.appearance'), key: 'appearance' },
    ],
  })

  return items
})

function onSelect(key: string) {
  if (key === 'home') void router.push('/')
  else if (key === 'run') void router.push('/run')
  else if (key === 'tasks') void router.push('/tasks')
  else if (key === 'sessions') void router.push('/sessions')
  else if (key === 'settings') void router.push('/settings')
  else if (key === 'config') void router.push('/settings/config')
  else if (key === 'auth') void router.push('/settings/auth')
  else if (key === 'capabilities') void router.push('/settings/capabilities')
  else if (key === 'appearance') void router.push('/settings/appearance')
  // others still placeholder
}
</script>

<template>
  <div class="sidebar-wrap">
    <div class="sidebar-brand">
      <span
        v-if="!ui.sidebarCollapsed"
        class="brand-text"
      >AutoSpider</span>
      <span
        v-else
        class="brand-icon"
      >🕷️</span>
    </div>
    <NMenu
      :options="options"
      :collapsed="ui.sidebarCollapsed"
      :collapsed-width="64"
      :collapsed-icon-size="20"
      @update:value="onSelect"
    />
  </div>
</template>

<style scoped>
.sidebar-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar-brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  padding: 0 16px;
  flex-shrink: 0;
}

.brand-text {
  white-space: nowrap;
  overflow: hidden;
}

.brand-icon {
  font-size: 20px;
}
</style>
