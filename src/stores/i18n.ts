import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n'

export const useLocaleStore = defineStore('locale', () => {
  const current = useStorage<SupportedLocale>('ui:locale', 'en')

  async function change(locale: SupportedLocale) {
    await setLocale(locale)
    current.value = locale
  }

  return { current, change, supported: SUPPORTED_LOCALES }
})
