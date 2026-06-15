<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import {
  NAlert, NButton, NCard, NDataTable, NSelect, NSpin, NSwitch,
  useMessage, type DataTableColumns,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useAuthStore } from '@/stores/auth'
import {
  listAlertPolicies, upsertAlertPolicy,
  type AlertPolicyUpsertRequest, type OpsAlertPolicy,
} from '@/api/diagnostics'

type Confidence = 'low' | 'medium' | 'high'

interface DraftPolicy {
  enabled: boolean
  min_confidence: Confidence
  channels: string[]
}

interface PolicyRow {
  type: string
}

const { t } = useI18n()
const message = useMessage()
const cap = useCapabilitiesStore()
const auth = useAuthStore()

// `ops_alerting` is ADR-026 Phase 4's capability flag, exposed via the ADR-034 D4
// capability-honesty pattern: the backend sets it once the OpsAlertPolicy/
// OpsAlertEvent tables exist. It is not yet in the generated Features type (the
// backend re-vendors openapi.json once the contract lands), so read it through a
// string-indexed view. Absent/false => the panel renders nothing: a deployment
// without the alerting tables never shows a broken page.
const alertingEnabled = computed(
  () => (cap.data?.features as Record<string, boolean> | undefined)?.ops_alerting === true,
)
// Upserting a policy requires admin on both backends; mirror the SubscriptionsView
// pattern and only expose write controls to admins so a read-only session isn't
// shown inputs/buttons that would 403.
const isAdmin = computed(() => auth.role === 'admin')

// Canonical incident-type catalog (mirrors OpsIncidentsPage's filter options). A
// type with no persisted policy shows as disabled until an admin enables + saves.
const INCIDENT_TYPES = ['failed_ingestion', 'stale_session', 'proxy_exhaustion', 'login_failure']

const policies = ref<OpsAlertPolicy[]>([])
const drafts = ref<Record<string, DraftPolicy>>({})
const loading = ref(false)
const savingType = ref<string | null>(null)
const error = ref<string | null>(null)

const confidenceOptions = [
  { label: 'low', value: 'low' },
  { label: 'medium', value: 'medium' },
  { label: 'high', value: 'high' },
]
const channelOptions = [{ label: 'email', value: 'email' }]

const rows = computed<PolicyRow[]>(() => INCIDENT_TYPES.map((type) => ({ type })))

function rebuildDrafts(): void {
  // We iterate the fixed catalog, so a persisted policy for an incident type not
  // in INCIDENT_TYPES is intentionally not surfaced — the catalog is the canonical
  // set of alertable types.
  const next: Record<string, DraftPolicy> = {}
  for (const type of INCIDENT_TYPES) {
    const existing = policies.value.find((p) => p.incident_type === type)
    next[type] = existing
      ? {
          enabled: existing.enabled,
          min_confidence: existing.min_confidence,
          channels: [...existing.channels],
        }
      : { enabled: false, min_confidence: 'medium', channels: [] }
  }
  drafts.value = next
}

async function fetchPolicies(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const res = await listAlertPolicies()
    policies.value = res.items
    rebuildDrafts()
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('diag.alerting.loadError')
  } finally {
    loading.value = false
  }
}

async function savePolicy(incidentType: string): Promise<void> {
  const draft = drafts.value[incidentType]
  if (!draft) return
  savingType.value = incidentType
  try {
    const body: AlertPolicyUpsertRequest = {
      min_confidence: draft.min_confidence,
      enabled: draft.enabled,
      channels: draft.channels,
    }
    await upsertAlertPolicy(incidentType, body)
    message.success(t('diag.alerting.saveSuccess'))
    await fetchPolicies()
  } catch {
    message.error(t('diag.alerting.saveError'))
  } finally {
    savingType.value = null
  }
}

const columns = computed<DataTableColumns<PolicyRow>>(() => {
  const cols: DataTableColumns<PolicyRow> = [
    {
      title: t('diag.alerting.col.type'),
      key: 'type',
      render: (row) => row.type,
    },
    {
      title: t('diag.alerting.col.enabled'),
      key: 'enabled',
      width: 90,
      render: (row) =>
        h(NSwitch, {
          value: drafts.value[row.type]?.enabled ?? false,
          disabled: !isAdmin.value,
          'onUpdate:value': (v: boolean) => {
            const d = drafts.value[row.type]
            if (d) d.enabled = v
          },
        }),
    },
    {
      title: t('diag.alerting.col.minConfidence'),
      key: 'min_confidence',
      width: 140,
      render: (row) =>
        h(NSelect, {
          value: drafts.value[row.type]?.min_confidence ?? 'medium',
          options: confidenceOptions,
          disabled: !isAdmin.value,
          size: 'small',
          style: 'width: 120px',
          'onUpdate:value': (v: Confidence) => {
            const d = drafts.value[row.type]
            if (d) d.min_confidence = v
          },
        }),
    },
    {
      title: t('diag.alerting.col.channels'),
      key: 'channels',
      render: (row) =>
        h(NSelect, {
          value: drafts.value[row.type]?.channels ?? [],
          options: channelOptions,
          multiple: true,
          filterable: true,
          tag: true,
          disabled: !isAdmin.value,
          size: 'small',
          placeholder: t('diag.alerting.channelsPlaceholder'),
          style: 'min-width: 200px',
          'onUpdate:value': (v: string[]) => {
            const d = drafts.value[row.type]
            if (d) d.channels = v
          },
        }),
    },
  ]
  if (isAdmin.value) {
    cols.push({
      title: t('diag.alerting.col.actions'),
      key: 'actions',
      width: 100,
      render: (row) =>
        h(
          NButton,
          {
            size: 'small',
            type: 'primary',
            loading: savingType.value === row.type,
            onClick: () => void savePolicy(row.type),
          },
          { default: () => t('diag.alerting.save') },
        ),
    })
  }
  return cols
})

// Load when the capability resolves — cap.data fills asynchronously, so a one-shot
// check can miss it (mirrors SettingsFilterRulesPage).
watch(
  alertingEnabled,
  (enabled) => {
    if (enabled) void fetchPolicies()
  },
  { immediate: true },
)
</script>

<template>
  <NCard
    v-if="alertingEnabled"
    :title="t('diag.alerting.title')"
    size="small"
    class="alert-policy-panel"
  >
    <template #header-extra>
      <NButton
        size="tiny"
        :loading="loading"
        @click="() => void fetchPolicies()"
      >
        {{ t('common.retry') }}
      </NButton>
    </template>

    <p class="panel-subtitle">
      {{ t('diag.alerting.subtitle') }}
    </p>

    <NAlert
      v-if="!isAdmin"
      type="info"
      :show-icon="true"
      style="margin-bottom: 12px"
    >
      {{ t('diag.alerting.readonlyHint') }}
    </NAlert>

    <NAlert
      v-if="error"
      type="error"
      closable
      style="margin-bottom: 12px"
      @close="error = null"
    >
      {{ error }}
    </NAlert>

    <NSpin :show="loading">
      <NDataTable
        :columns="columns"
        :data="rows"
        size="small"
        :row-key="(row: PolicyRow) => row.type"
      />
    </NSpin>
  </NCard>
</template>

<style scoped>
.alert-policy-panel {
  margin-bottom: 16px;
}
.panel-subtitle {
  color: var(--n-text-color-3);
  font-size: 13px;
  margin: 0 0 12px;
}
</style>
