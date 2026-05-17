import { createI18n } from 'vue-i18n'
import en from './locales/en.json'

export type SupportedLocale = 'zh-CN' | 'en' | 'ja'

export const SUPPORTED_LOCALES: SupportedLocale[] = ['zh-CN', 'en', 'ja']

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en },
})

export async function setLocale(locale: SupportedLocale) {
  const available = i18n.global.availableLocales as string[]
  if (!available.includes(locale)) {
    const messages = await import(`./locales/${locale}.json`)
    i18n.global.setLocaleMessage(locale, messages.default)
  }
  ;(i18n.global.locale as { value: string }).value = locale
  document.documentElement.lang = locale
}

export default i18n
