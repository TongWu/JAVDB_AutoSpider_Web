<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NSpace,
  NInput,
  NButton,
  NAlert,
  NSpin,
  useMessage,
} from 'naive-ui'
import { apiProxyPage } from '@/api/explore'
import { useBrowseStore } from '@/stores/browse'
import { extractErrorMessage } from '@/api/errors'

const { t } = useI18n()
const browse = useBrowseStore()
const message = useMessage()

const url = ref<string>('')
const html = ref<string>('')
const loading = ref(false)
const error = ref<string | null>(null)

// Seed the URL field from the browse query if it looks like a javdb URL.
watch(
  () => browse.query,
  (q) => {
    if (q && /^https?:\/\/.*javdb\.com\//i.test(q)) {
      url.value = q
    }
  },
  { immediate: true },
)

async function fetchPreview(): Promise<void> {
  const target = url.value.trim()
  if (!target) {
    error.value = t('browse.preview.noUrl')
    return
  }
  loading.value = true
  error.value = null
  try {
    html.value = await apiProxyPage(target)
  } catch (err) {
    html.value = ''
    error.value = extractErrorMessage(err)
  } finally {
    loading.value = false
  }
}

async function parseThis(): Promise<void> {
  const target = url.value.trim()
  if (!target) return
  browse.setMode('resolve')
  try {
    await browse.submit(target)
  } catch (err) {
    message.error(extractErrorMessage(err))
  }
}
</script>

<template>
  <NSpace vertical :size="12">
    <NSpace align="center" :size="8" wrap>
      <NInput
        v-model:value="url"
        :placeholder="t('browse.preview.urlPlaceholder')"
        style="min-width: 360px; flex: 1;"
        @keyup.enter="fetchPreview"
      />
      <NButton type="primary" :loading="loading" :disabled="!url.trim()" @click="fetchPreview">
        {{ t('browse.preview.fetch') }}
      </NButton>
      <NButton :disabled="!url.trim()" @click="parseThis">
        {{ t('browse.preview.parseThis') }}
      </NButton>
    </NSpace>

    <NAlert v-if="error" type="warning" :show-icon="true" closable @close="error = null">
      {{ error }}
    </NAlert>

    <p class="muted">{{ t('browse.preview.sandboxNote') }}</p>

    <NSpin :show="loading">
      <div v-if="html" class="frame-wrap">
        <!--
          sandbox="allow-same-origin" — no scripts, no top-level navigation, no
          forms. The BE has already sanitised the document, so the iframe is a
          read-only snapshot used for parse debugging only.
        -->
        <iframe
          class="preview-iframe"
          sandbox="allow-same-origin"
          referrerpolicy="no-referrer"
          :srcdoc="html"
          title="javdb preview"
        ></iframe>
      </div>
      <div v-else class="empty">
        {{ t('browse.preview.empty') }}
      </div>
    </NSpin>
  </NSpace>
</template>

<style scoped>
.frame-wrap {
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  overflow: hidden;
  background: var(--n-color-modal);
}
.preview-iframe {
  width: 100%;
  height: 70vh;
  border: 0;
  display: block;
  background: white;
}
.muted {
  margin: 0;
  font-size: 12px;
  color: var(--n-text-color-2);
  line-height: 1.4;
}
.empty {
  padding: 32px 0;
  text-align: center;
  color: var(--n-text-color-2);
  font-size: 13px;
}
</style>
