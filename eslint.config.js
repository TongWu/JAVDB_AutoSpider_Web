import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVueI18n from '@intlify/eslint-plugin-vue-i18n'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'vite.config.ts',
      'vitest*.config.ts',
      'playwright.config.ts',
    ],
  },

  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    name: 'app/layout-single-word',
    files: ['src/components/layout/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  {
    name: 'app/test-files',
    files: ['tests/**/*.{ts,tsx,vue}'],
    rules: {
      'vue/one-component-per-file': 'off',
    },
  },

  {
    name: 'app/vue-i18n',
    plugins: {
      '@intlify/vue-i18n': pluginVueI18n,
    },
    rules: {
      '@intlify/vue-i18n/no-unused-keys': 'warn',
    },
    settings: {
      'vue-i18n': {
        localeDir: './src/i18n/locales/*.json',
      },
    },
  },
)
