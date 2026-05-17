import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark' | 'system'

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = useStorage<boolean>('ui:sidebar-collapsed', false)
  const themeMode = useStorage<ThemeMode>('ui:theme', 'system')
  return { sidebarCollapsed, themeMode }
})
