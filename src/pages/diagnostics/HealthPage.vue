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
  NSpin,
} from 'naive-ui'
import { apiHealth, type HealthResponse } from '@/api/health'
import { deepHealthCheck } from '@/api/diagnostics'

const { t } = useI18n()

// ── Quick health (GET /api/health) ──────────────────────────────────
const quickHealth = ref<HealthResponse | null>(null)
const quickLoading = ref(false)
const quickError = ref<string | null>(null)

async function fetchQuickHealth() {
  quickLoading.value = true
  quickError.value = null
  try {
    quickHealth.value = await apiHealth()
  } catch (e) {
    quickError.value = e instanceof Error ? e.message : String(e)
  } finally {
    quickLoading.value = false
  }
}

// ── Deep health check (POST /api/health-check) ──────────────────────
const deepResult = ref<Record<string, unknown> | null>(null)
const deepLoading = ref(false)
const deepError = ref<string | null>(null)

async function runDeepCheck() {
  deepLoading.value = true
  deepError.value = null
  deepResult.value = null
  try {
    deepResult.value = await deepHealthCheck()
  } catch (e) {
    deepError.value = e instanceof Error ? e.message : String(e)
  } finally {
    deepLoading.value = false
  }
}

onMounted(() => fetchQuickHealth())

// ── Helpers ─────────────────────────────────────────────────────────
function statusTagType(status: unknown): 'success' | 'error' | 'warning' | 'default' {
  if (typeof status !== 'string') return 'default'
  const s = status.toLowerCase()
  if (s === 'ok' || s === 'pass' || s === 'healthy' || s === 'true') return 'success'
  if (s === 'fail' || s === 'error' || s === 'unhealthy' || s === 'false') return 'error'
  if (s === 'warn' || s === 'warning' || s === 'degraded') return 'warning'
  return 'default'
}

function checksEntries(result: Record<string, unknown>): [string, Record<string, unknown>][] {
  const checks = result.checks
  if (!checks || typeof checks !== 'object') return []
  return Object.entries(checks as Record<string, unknown>).map(([k, v]) => [
    k,
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : { status: String(v) },
  ])
}
</script>

<template>
  <div class="health-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.health') }}</h1>
        <p class="subtitle">
          {{ t('diag.health.subtitle') }}
        </p>
      </div>
    </header>

    <!-- Quick Health Status -->
    <NCard :title="t('diag.health.quickStatus')">
      <template #header-extra>
        <NButton
          size="small"
          :loading="quickLoading"
          @click="fetchQuickHealth"
        >
          {{ t('common.retry') }}
        </NButton>
      </template>

      <NAlert
        v-if="quickError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="quickError = null"
      >
        {{ quickError }}
      </NAlert>

      <NSpin :show="quickLoading">
        <NDescriptions
          v-if="quickHealth"
          bordered
          :column="2"
          label-placement="left"
        >
          <NDescriptionsItem
            v-for="(value, key) in quickHealth"
            :key="key"
            :label="String(key)"
          >
            <NTag
              v-if="typeof value === 'string'"
              size="small"
              round
              :type="statusTagType(value)"
            >
              {{ value }}
            </NTag>
            <span v-else>{{ JSON.stringify(value) }}</span>
          </NDescriptionsItem>
        </NDescriptions>
        <div
          v-else-if="!quickLoading && !quickError"
          class="empty-hint"
        >
          {{ t('common.loading') }}
        </div>
      </NSpin>
    </NCard>

    <!-- Deep Health Check -->
    <NCard :title="t('diag.health.deepCheck')">
      <template #header-extra>
        <NButton
          type="primary"
          size="small"
          :loading="deepLoading"
          @click="runDeepCheck"
        >
          {{ t('diag.health.runDeepCheck') }}
        </NButton>
      </template>

      <NAlert
        v-if="deepError"
        type="error"
        :title="t('errors.generic.title')"
        closable
        style="margin-bottom: 12px"
        @close="deepError = null"
      >
        {{ deepError }}
      </NAlert>

      <NSpin :show="deepLoading">
        <div
          v-if="deepResult"
          class="deep-result"
        >
          <!-- Overall status -->
          <NSpace
            align="center"
            :size="12"
            style="margin-bottom: 16px"
          >
            <span class="form-label">{{ t('diag.health.overall') }}:</span>
            <NTag
              size="medium"
              round
              :type="statusTagType(String(deepResult.overall ?? ''))"
            >
              {{ deepResult.overall ?? '—' }}
            </NTag>
          </NSpace>

          <!-- Subsystem checks -->
          <div
            v-for="[name, check] in checksEntries(deepResult)"
            :key="name"
            class="check-row"
          >
            <NTag
              size="small"
              round
              :type="statusTagType(String(check.status ?? check.result ?? ''))"
            >
              {{ check.status ?? check.result ?? '—' }}
            </NTag>
            <span class="check-name">{{ name }}</span>
            <span
              v-if="check.detail || check.message || check.error"
              class="check-detail"
            >
              {{ check.detail ?? check.message ?? check.error }}
            </span>
          </div>
        </div>
        <div
          v-else-if="!deepLoading && !deepError"
          class="empty-hint"
        >
          {{ t('diag.health.noResult') }}
        </div>
      </NSpin>
    </NCard>
  </div>
</template>

<style scoped>
.health-page {
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
.form-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--n-border-color);
}
.check-row:last-child {
  border-bottom: none;
}
.check-name {
  font-weight: 600;
  font-size: 13px;
  min-width: 100px;
}
.check-detail {
  font-size: 12px;
  color: var(--n-text-color-3);
}
.empty-hint {
  color: var(--n-text-color-3);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}
</style>
