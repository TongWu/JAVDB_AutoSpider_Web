import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  apiGetConfig,
  apiGetConfigMeta,
  apiUpdateConfig,
  type ConfigMetaField,
  type ConfigValues,
} from '@/api/config'

// BE returns raw section labels like "QBITTORRENT CONFIGURATION"; we normalise
// them into stable i18n keys here so both ordering and translation lookups
// agree on a single canonical form.
const BE_SECTION_TO_KEY: Record<string, string> = {
  'GIT CONFIGURATION': 'git',
  'QBITTORRENT CONFIGURATION': 'qbittorrent',
  'SMTP CONFIGURATION': 'smtp',
  'PROXY CONFIGURATION': 'proxy',
  'JAVDB LOGIN CONFIGURATION': 'javdb',
  'CLOUDFLARE BYPASS CONFIGURATION': 'cfBypass',
  'SPIDER CONFIGURATION': 'spider',
  'REQUEST TIMING CONFIGURATION': 'timing',
  'LOGGING CONFIGURATION': 'logging',
  'PARSING CONFIGURATION': 'parsing',
  'FILE PATHS': 'paths',
  'PIKPAK CONFIGURATION': 'pikpak',
  'QBITTORRENT FILE FILTER CONFIGURATION': 'qbFileFilter',
  'RCLONE CONFIGURATION': 'rclone',
  'STORAGE MODE': 'storage',
  'D1 / CLOUDFLARE CONFIGURATION': 'd1',
  'MOVIE CLAIM CONFIGURATION': 'movieClaim',
  'RUNNER REGISTRY CONFIGURATION': 'runnerRegistry',
  'DEDUP CONFIGURATION': 'dedup',
  'API CONSOLE / BACKEND': 'apiConsole',
}

export function normalizeSectionKey(raw: string): string {
  if (BE_SECTION_TO_KEY[raw]) return BE_SECTION_TO_KEY[raw]
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'advanced'
}

// Display order for normalized section keys. Anything missing falls through.
const SECTION_ORDER = [
  'apiConsole',
  'qbittorrent',
  'qbFileFilter',
  'javdb',
  'proxy',
  'cfBypass',
  'spider',
  'timing',
  'parsing',
  'pikpak',
  'rclone',
  'dedup',
  'smtp',
  'storage',
  'd1',
  'movieClaim',
  'runnerRegistry',
  'paths',
  'logging',
  'git',
  'advanced',
]

export const useConfigStore = defineStore('config', () => {
  const values = ref<ConfigValues>({})
  const initial = ref<ConfigValues>({})
  const meta = ref<ConfigMetaField[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<unknown>(null)
  const lastSavedAt = ref<number | null>(null)

  const dirtyKeys = computed<string[]>(() => {
    const out: string[] = []
    for (const key of Object.keys(values.value)) {
      const before = initial.value[key]
      const after = values.value[key]
      if (!shallowEqual(before, after)) out.push(key)
    }
    return out
  })

  const isDirty = computed(() => dirtyKeys.value.length > 0)

  const groupedFields = computed<Record<string, ConfigMetaField[]>>(() => {
    const groups: Record<string, ConfigMetaField[]> = {}
    for (const field of meta.value) {
      const sec = normalizeSectionKey(field.section || '')
      if (!groups[sec]) groups[sec] = []
      groups[sec].push(field)
    }
    return groups
  })

  const orderedSections = computed<string[]>(() => {
    const known = new Set(Object.keys(groupedFields.value))
    const ordered: string[] = []
    for (const s of SECTION_ORDER) {
      if (known.has(s)) {
        ordered.push(s)
        known.delete(s)
      }
    }
    return [...ordered, ...known]
  })

  async function fetch(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [cfg, m] = await Promise.all([apiGetConfig(false), apiGetConfigMeta()])
      values.value = { ...cfg }
      initial.value = { ...cfg }
      meta.value = m.fields ?? []
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  function set(key: string, value: unknown): void {
    values.value = { ...values.value, [key]: value }
  }

  function discard(): void {
    values.value = { ...initial.value }
  }

  async function save(): Promise<void> {
    if (!isDirty.value || saving.value) return
    saving.value = true
    error.value = null
    const patch: ConfigValues = {}
    for (const k of dirtyKeys.value) patch[k] = values.value[k]
    try {
      await apiUpdateConfig(patch)
      // After save, BE may mask back sensitive fields. Re-fetch to sync.
      const fresh = await apiGetConfig(false)
      values.value = { ...fresh }
      initial.value = { ...fresh }
      lastSavedAt.value = Date.now()
    } catch (err) {
      error.value = err
      throw err
    } finally {
      saving.value = false
    }
  }

  return {
    values,
    initial,
    meta,
    loading,
    saving,
    error,
    lastSavedAt,
    dirtyKeys,
    isDirty,
    groupedFields,
    orderedSections,
    fetch,
    set,
    discard,
    save,
  }
})

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a == null || b == null) return a === b
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}
