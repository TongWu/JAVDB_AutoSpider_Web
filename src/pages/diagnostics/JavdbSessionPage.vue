<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NAlert,
  NButton,
  NSpace,
  NTag,
  NDescriptions,
  NDescriptionsItem,
  NInput,
  NCollapse,
  NCollapseItem,
  NSpin,
} from 'naive-ui'
import {
  getJavdbSession,
  refreshJavdbSession,
  type JavdbSessionStatus,
  type JavdbSessionRefreshResponse,
} from '@/api/diagnostics'

const { t } = useI18n()

// ── Session status state ────────────────────────────────────────────
const sessionStatus = ref<JavdbSessionStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref<string | null>(null)

async function fetchStatus() {
  statusLoading.value = true
  statusError.value = null
  try {
    sessionStatus.value = await getJavdbSession()
  } catch (e) {
    statusError.value = e instanceof Error ? e.message : String(e)
  } finally {
    statusLoading.value = false
  }
}

onMounted(() => fetchStatus())

// ── Refresh action state ────────────────────────────────────────────
const refreshLoading = ref(false)
const refreshError = ref<string | null>(null)
const refreshResult = ref<JavdbSessionRefreshResponse | null>(null)

async function refreshHeadless() {
  refreshLoading.value = true
  refreshError.value = null
  refreshResult.value = null
  try {
    refreshResult.value = await refreshJavdbSession({ method: 'headless' })
    // Reload status after refresh
    await fetchStatus()
  } catch (e) {
    refreshError.value = e instanceof Error ? e.message : String(e)
  } finally {
    refreshLoading.value = false
  }
}

// ── Cookie paste state ──────────────────────────────────────────────
const cookieValue = ref('')
const pasteLoading = ref(false)
const pasteError = ref<string | null>(null)
const pasteResult = ref<JavdbSessionRefreshResponse | null>(null)

async function submitCookie() {
  pasteLoading.value = true
  pasteError.value = null
  pasteResult.value = null
  try {
    pasteResult.value = await refreshJavdbSession({
      method: 'cookie_paste',
      cookie_value: cookieValue.value,
    })
    // Reload status after paste
    await fetchStatus()
  } catch (e) {
    pasteError.value = e instanceof Error ? e.message : String(e)
  } finally {
    pasteLoading.value = false
  }
}
</script>

<template>
  <div class="javdb-session-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.javdbSession') }}</h1>
        <p class="subtitle">
          {{ t('diag.javdb.subtitle') }}
        </p>
      </div>
    </header>

    <!-- Session Status Card -->
    <NCard :title="t('diag.javdb.status')">
      <template #header-extra>
        <NButton
          size="small"
          :loading="statusLoading"
          @click="fetchStatus"
        >
          {{ t('common.retry') }}
        </NButton>
      </template>

      <NAlert
        v-if="statusError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="statusError = null"
      >
        {{ statusError }}
      </NAlert>

      <NSpin :show="statusLoading">
        <NDescriptions
          v-if="sessionStatus"
          bordered
          :column="2"
          label-placement="left"
        >
          <NDescriptionsItem :label="t('diag.javdb.cookiePresent')">
            <NTag
              size="small"
              round
              :type="sessionStatus.cookie_present ? 'success' : 'error'"
            >
              {{ sessionStatus.cookie_present ? t('common.yes') : t('common.no') }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem :label="t('diag.javdb.isValid')">
            <NTag
              size="small"
              round
              :type="sessionStatus.is_likely_valid ? 'success' : 'error'"
            >
              {{ sessionStatus.is_likely_valid ? t('common.yes') : t('common.no') }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem
            v-if="sessionStatus.cookie_value_preview"
            :label="t('diag.javdb.cookiePreview')"
          >
            <code>{{ sessionStatus.cookie_value_preview }}</code>
          </NDescriptionsItem>
          <NDescriptionsItem
            v-if="sessionStatus.last_refresh_time"
            :label="t('diag.javdb.lastRefresh')"
          >
            {{ sessionStatus.last_refresh_time }}
          </NDescriptionsItem>
          <NDescriptionsItem
            v-if="sessionStatus.estimated_expiry"
            :label="t('diag.javdb.estimatedExpiry')"
          >
            {{ sessionStatus.estimated_expiry }}
          </NDescriptionsItem>
        </NDescriptions>
        <div
          v-else-if="!statusLoading && !statusError"
          class="empty-hint"
        >
          {{ t('common.loading') }}
        </div>
      </NSpin>
    </NCard>

    <!-- Actions Card -->
    <NCard :title="t('diag.javdb.actions')">
      <NSpace
        vertical
        :size="16"
      >
        <!-- Headless refresh -->
        <NSpace
          align="center"
          :size="12"
        >
          <NButton
            type="primary"
            :loading="refreshLoading"
            @click="refreshHeadless"
          >
            {{ t('diag.javdb.refreshHeadless') }}
          </NButton>
        </NSpace>

        <NAlert
          v-if="refreshError"
          type="error"
          :title="t('errors.generic.title')"
          closable
          @close="refreshError = null"
        >
          {{ refreshError }}
        </NAlert>

        <NAlert
          v-if="refreshResult"
          :type="refreshResult.success ? 'success' : 'error'"
          :title="refreshResult.success ? t('diag.javdb.refreshSuccess') : t('diag.javdb.refreshFailed')"
          closable
          @close="refreshResult = null"
        >
          <template v-if="refreshResult.new_cookie_preview">
            {{ t('diag.javdb.newCookiePreview') }}: <code>{{ refreshResult.new_cookie_preview }}</code>
          </template>
          <template v-if="refreshResult.error">
            {{ refreshResult.error }}
          </template>
        </NAlert>

        <!-- Cookie paste -->
        <NCollapse>
          <NCollapseItem :title="t('diag.javdb.pasteCookie')">
            <NSpace
              vertical
              :size="8"
            >
              <NInput
                v-model:value="cookieValue"
                type="textarea"
                :placeholder="t('diag.javdb.cookiePlaceholder')"
                :rows="3"
              />
              <NButton
                :loading="pasteLoading"
                :disabled="!cookieValue.trim()"
                @click="submitCookie"
              >
                {{ t('common.submit') }}
              </NButton>

              <NAlert
                v-if="pasteError"
                type="error"
                :title="t('errors.generic.title')"
                closable
                @close="pasteError = null"
              >
                {{ pasteError }}
              </NAlert>

              <NAlert
                v-if="pasteResult"
                :type="pasteResult.success ? 'success' : 'error'"
                :title="pasteResult.success ? t('diag.javdb.refreshSuccess') : t('diag.javdb.refreshFailed')"
                closable
                @close="pasteResult = null"
              >
                <template v-if="pasteResult.new_cookie_preview">
                  {{ t('diag.javdb.newCookiePreview') }}: <code>{{ pasteResult.new_cookie_preview }}</code>
                </template>
                <template v-if="pasteResult.error">
                  {{ pasteResult.error }}
                </template>
              </NAlert>
            </NSpace>
          </NCollapseItem>
        </NCollapse>
      </NSpace>
    </NCard>
  </div>
</template>

<style scoped>
.javdb-session-page {
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
.empty-hint {
  color: var(--n-text-color-3);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}
</style>
