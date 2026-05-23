<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NButton,
  NSpace,
  NInput,
  NRadioGroup,
  NRadioButton,
  NSelect,
  NSwitch,
  NCode,
} from 'naive-ui'
import { apiParseUrl } from '@/api/parse'
import { parseHtml, detectPageType, type ParseType } from '@/api/diagnostics'

const { t } = useI18n()

// ── Input state ─────────────────────────────────────────────────────
const inputMode = ref<'html' | 'url'>('html')
const htmlInput = ref('')
const urlInput = ref('')
const useProxy = ref(false)
const useCookie = ref(false)
const parserType = ref<string>('auto-detect')

const parserOptions = [
  { label: 'Auto-detect', value: 'auto-detect' },
  { label: 'Index', value: 'index' },
  { label: 'Detail', value: 'detail' },
  { label: 'Category', value: 'category' },
  { label: 'Top', value: 'top' },
  { label: 'Tags', value: 'tags' },
]

// ── Result state ────────────────────────────────────────────────────
const result = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function runParse() {
  loading.value = true
  error.value = null
  result.value = null
  try {
    let data: Record<string, unknown>

    if (inputMode.value === 'url') {
      // URL mode — use existing apiParseUrl
      data = await apiParseUrl(urlInput.value, {
        use_proxy: useProxy.value,
        use_cookie: useCookie.value,
      })
    } else {
      // HTML mode
      const html = htmlInput.value
      if (parserType.value === 'auto-detect') {
        const detected = await detectPageType(html)
        const type = detected.page_type as ParseType
        data = await parseHtml(type, html)
      } else {
        data = await parseHtml(parserType.value as ParseType, html)
      }
    }

    result.value = JSON.stringify(data, null, 2)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function copyResult() {
  if (result.value) {
    navigator.clipboard.writeText(result.value)
  }
}
</script>

<template>
  <div class="parse-tester-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.parseTester') }}</h1>
        <p class="subtitle">
          {{ t('diag.parse.subtitle') }}
        </p>
      </div>
    </header>

    <div class="two-panel">
      <!-- Left panel: Input -->
      <NCard :title="t('diag.parse.input')">
        <NSpace
          vertical
          :size="12"
        >
          <!-- Input mode toggle -->
          <NRadioGroup v-model:value="inputMode">
            <NRadioButton value="html">
              {{ t('diag.parse.modeHtml') }}
            </NRadioButton>
            <NRadioButton value="url">
              {{ t('diag.parse.modeUrl') }}
            </NRadioButton>
          </NRadioGroup>

          <!-- HTML textarea -->
          <NInput
            v-if="inputMode === 'html'"
            v-model:value="htmlInput"
            type="textarea"
            :placeholder="t('diag.parse.htmlPlaceholder')"
            :rows="12"
          />

          <!-- URL input + options -->
          <template v-if="inputMode === 'url'">
            <NInput
              v-model:value="urlInput"
              :placeholder="t('diag.parse.urlPlaceholder')"
            />
            <NSpace
              :size="16"
              align="center"
            >
              <NSpace
                align="center"
                :size="6"
              >
                <span class="form-label">{{ t('diag.parse.useProxy') }}</span>
                <NSwitch v-model:value="useProxy" />
              </NSpace>
              <NSpace
                align="center"
                :size="6"
              >
                <span class="form-label">{{ t('diag.parse.useCookie') }}</span>
                <NSwitch v-model:value="useCookie" />
              </NSpace>
            </NSpace>
          </template>

          <!-- Parser type (HTML mode only) -->
          <NSpace
            v-if="inputMode === 'html'"
            align="center"
            :size="8"
          >
            <span class="form-label">{{ t('diag.parse.parserType') }}</span>
            <NSelect
              v-model:value="parserType"
              :options="parserOptions"
              style="width: 180px"
              size="small"
            />
          </NSpace>

          <!-- Parse button -->
          <NButton
            type="primary"
            :loading="loading"
            @click="runParse"
          >
            {{ t('diag.parse.parseButton') }}
          </NButton>
        </NSpace>
      </NCard>

      <!-- Right panel: Result -->
      <NCard :title="t('diag.parse.result')">
        <template #header-extra>
          <NButton
            v-if="result"
            size="small"
            @click="copyResult"
          >
            {{ t('diag.parse.copy') }}
          </NButton>
        </template>

        <NAlert
          v-if="error"
          type="error"
          :title="t('errors.generic.title')"
          closable
          style="margin-bottom: 12px"
          @close="error = null"
        >
          {{ error }}
        </NAlert>

        <div
          v-if="result"
          class="result-area"
        >
          <NCode
            :code="result"
            language="json"
            word-wrap
          />
        </div>
        <div
          v-else-if="!loading && !error"
          class="empty-hint"
        >
          {{ t('diag.parse.noResult') }}
        </div>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.parse-tester-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.page-header-left h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.subtitle {
  color: var(--n-text-color-2);
  font-size: 13px;
  margin-top: 4px;
}
.two-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .two-panel {
    grid-template-columns: 1fr;
  }
}
.form-label {
  font-size: 13px;
  white-space: nowrap;
}
.result-area {
  max-height: 500px;
  overflow: auto;
}
.empty-hint {
  color: var(--n-text-color-3);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}
</style>
