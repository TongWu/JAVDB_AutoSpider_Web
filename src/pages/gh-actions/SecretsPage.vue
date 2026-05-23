<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  type DataTableColumns,
} from 'naive-ui'
import {
  listSecrets,
  createOrUpdateSecret,
  deleteSecret,
  type SecretItem,
} from '@/api/gh-actions'
import { useCapabilitiesStore } from '@/stores/capabilities'

const { t } = useI18n()
const router = useRouter()
const cap = useCapabilitiesStore()

// ── Access guard ────────────────────────────────────────────────────
const ghTier = computed(() => cap.data?.gh_actions?.tier ?? null)

onMounted(() => {
  const tier = ghTier.value
  if (tier !== null && tier !== 'admin') {
    void router.replace('/403')
    return
  }
  void fetchSecrets()
})

watch(ghTier, (tier) => {
  if (tier !== null && tier !== 'admin') {
    void router.replace('/403')
  }
})

// ── Secrets table ───────────────────────────────────────────────────
const secrets = ref<SecretItem[]>([])
const loading = ref(false)
const fetchError = ref<string | null>(null)

async function fetchSecrets() {
  loading.value = true
  fetchError.value = null
  try {
    const res = await listSecrets()
    secrets.value = res.secrets
  } catch (e) {
    fetchError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

// ── Delete ──────────────────────────────────────────────────────────
const deleteError = ref<string | null>(null)

async function onDelete(name: string) {
  deleteError.value = null
  try {
    await deleteSecret(name)
    await fetchSecrets()
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : String(e)
  }
}

// ── Modal (add / update) ────────────────────────────────────────────
const modalVisible = ref(false)
const modalMode = ref<'add' | 'update'>('add')
const modalName = ref('')
const modalValue = ref('')
const modalNameError = ref<string | null>(null)
const modalSubmitError = ref<string | null>(null)
const modalSubmitting = ref(false)

const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]*$/

function openAdd() {
  modalMode.value = 'add'
  modalName.value = ''
  modalValue.value = ''
  modalNameError.value = null
  modalSubmitError.value = null
  modalVisible.value = true
}

function openUpdate(name: string) {
  modalMode.value = 'update'
  modalName.value = name
  modalValue.value = ''
  modalNameError.value = null
  modalSubmitError.value = null
  modalVisible.value = true
}

function validateName(): boolean {
  if (!SECRET_NAME_RE.test(modalName.value)) {
    modalNameError.value = 'Must start with A-Z and contain only A-Z, 0-9, _'
    return false
  }
  modalNameError.value = null
  return true
}

async function submitModal() {
  if (!validateName()) return
  if (!modalValue.value.trim()) {
    modalSubmitError.value = 'Secret value cannot be empty'
    return
  }
  modalSubmitting.value = true
  modalSubmitError.value = null
  try {
    await createOrUpdateSecret({ name: modalName.value, value: modalValue.value })
    modalVisible.value = false
    await fetchSecrets()
  } catch (e) {
    modalSubmitError.value = e instanceof Error ? e.message : String(e)
  } finally {
    modalSubmitting.value = false
  }
}

// ── Table columns ───────────────────────────────────────────────────
const columns = computed<DataTableColumns<SecretItem>>(() => [
  {
    title: 'Name',
    key: 'name',
    minWidth: 200,
    ellipsis: { tooltip: true },
  },
  {
    title: 'Created',
    key: 'created_at',
    width: 180,
    render: (row) => new Date(row.created_at).toLocaleString(),
  },
  {
    title: 'Updated',
    key: 'updated_at',
    width: 180,
    render: (row) => new Date(row.updated_at).toLocaleString(),
  },
  {
    title: 'Actions',
    key: 'actions',
    width: 160,
    render: (row) =>
      h(NSpace, { size: 8 }, () => [
        h(
          NButton,
          {
            size: 'tiny',
            onClick: () => openUpdate(row.name),
          },
          () => 'Update',
        ),
        h(
          NPopconfirm,
          {
            onPositiveClick: () => onDelete(row.name),
          },
          {
            default: () => `Delete secret "${row.name}"?`,
            trigger: () =>
              h(
                NButton,
                { size: 'tiny', type: 'error' },
                () => t('common.delete'),
              ),
          },
        ),
      ]),
  },
])
</script>

<template>
  <div class="secrets-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.secrets') }}</h1>
        <p class="subtitle">
          Manage GitHub Actions repository secrets
        </p>
      </div>
      <NButton
        type="primary"
        size="small"
        @click="openAdd"
      >
        Add Secret
      </NButton>
    </header>

    <NAlert
      type="warning"
      style="margin-bottom: 16px"
    >
      Secret values cannot be retrieved after saving. Only the name and timestamps are visible.
    </NAlert>

    <NCard size="small">
      <template #header-extra>
        <NButton
          size="tiny"
          :loading="loading"
          @click="fetchSecrets"
        >
          {{ t('common.retry') }}
        </NButton>
      </template>

      <NAlert
        v-if="fetchError"
        type="error"
        closable
        style="margin-bottom: 8px"
        @close="fetchError = null"
      >
        {{ fetchError }}
      </NAlert>

      <NAlert
        v-if="deleteError"
        type="error"
        closable
        style="margin-bottom: 8px"
        @close="deleteError = null"
      >
        {{ deleteError }}
      </NAlert>

      <NDataTable
        :columns="columns"
        :data="secrets"
        :loading="loading"
        :row-key="(row: SecretItem) => row.name"
        striped
      />
    </NCard>

    <!-- Add / Update modal -->
    <NModal
      v-model:show="modalVisible"
      preset="card"
      :title="modalMode === 'add' ? 'Add Secret' : 'Update Secret'"
      style="width: 480px"
    >
      <NSpace
        vertical
        :size="12"
      >
        <div>
          <span class="form-label">Name</span>
          <NInput
            v-model:value="modalName"
            size="small"
            :disabled="modalMode === 'update'"
            placeholder="MY_SECRET_NAME"
            :status="modalNameError ? 'error' : undefined"
            @blur="validateName"
          />
          <p
            v-if="modalNameError"
            class="field-error"
          >
            {{ modalNameError }}
          </p>
        </div>

        <div>
          <span class="form-label">Value</span>
          <NInput
            v-model:value="modalValue"
            type="textarea"
            size="small"
            :rows="4"
            placeholder="Secret value"
          />
        </div>

        <NAlert
          v-if="modalSubmitError"
          type="error"
          closable
          @close="modalSubmitError = null"
        >
          {{ modalSubmitError }}
        </NAlert>

        <NSpace justify="end">
          <NButton
            size="small"
            @click="modalVisible = false"
          >
            {{ t('common.cancel') }}
          </NButton>
          <NButton
            type="primary"
            size="small"
            :loading="modalSubmitting"
            @click="submitModal"
          >
            {{ t('common.save') }}
          </NButton>
        </NSpace>
      </NSpace>
    </NModal>
  </div>
</template>

<style scoped>
.secrets-page {
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
  display: block;
  font-size: 13px;
  margin-bottom: 4px;
}

.field-error {
  font-size: 12px;
  color: var(--n-error-color);
  margin: 4px 0 0;
}
</style>
