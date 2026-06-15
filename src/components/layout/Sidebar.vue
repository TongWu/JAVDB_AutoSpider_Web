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
    { label: t('nav.stats'), key: 'stats', icon: () => '📊' },
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

  // Library: shown when ANY library-suite capability is present. The Library
  // page gates each tab independently (acquisition always; ownership /
  // consumption / watchlist by their own flags), so the nav entry must mirror
  // that union rather than hinge on closed_loop alone — otherwise a deployment
  // with only WatchIntent (watch_intent=true, closed_loop=false) would hide the
  // nav while the page has working content (ADR-034 D4 / ADR-054 WS1).
  if (
    !features ||
    features.closed_loop ||
    features.library_ownership ||
    features.library_consumption ||
    features.watch_intent
  ) {
    items.push({ label: t('nav.library'), key: 'library', icon: () => '📚' })
  }

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
      { label: t('nav.opsIncidents'), key: 'opsIncidents' },
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
    label: t('nav.migrations'),
    key: 'migrations',
    icon: () => '🗄️',
  })

  items.push({
    label: t('nav.logs'),
    key: 'logs',
    icon: () => '📜',
  })

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

const routeMap: Record<string, string> = {
  home: '/',
  stats: '/stats',
  run: '/run',
  tasks: '/tasks',
  sessions: '/sessions',
  browse: '/browse',
  library: '/library',
  settings: '/settings',
  config: '/settings/config',
  auth: '/settings/auth',
  capabilities: '/settings/capabilities',
  appearance: '/settings/appearance',
  movies: '/data/movies',
  torrents: '/data/torrents',
  qbittorrent: '/ops/qb',
  pikpak: '/ops/pikpak',
  rclone: '/ops/rclone',
  email: '/ops/email',
  cleanup: '/ops/cleanup',
  health: '/diag/health',
  parseTester: '/diag/parse',
  javdbSession: '/diag/javdb',
  opsIncidents: '/diag/ops-incidents',
  runs: '/gh-actions',
  workflows: '/gh-actions/workflows',
  secrets: '/gh-actions/secrets',
  migrations: '/migrations',
  logs: '/logs',
}

function onSelect(key: string) {
  const path = routeMap[key]
  if (path) void router.push(path)
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
