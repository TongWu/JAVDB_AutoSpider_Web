<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NAlert, NButton, NCard, NDataTable, NGi, NGrid, NInput, NSpace, NSpin,
  NStatistic, NSwitch, useMessage, type DataTableColumns,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import {
  listSubscriptions, upsertSubscription, deleteSubscription,
  type ActorSubscription,
} from '@/api/subscriptions'

const { t } = useI18n()
const message = useMessage()
const auth = useAuthStore()
// Follow/unfollow/toggle require admin on both backends; mirror the
// ResolveMagnetTable pattern and only expose write controls to admins so a
// read-only session isn't shown buttons that 403.
const isAdmin = computed(() => auth.role === 'admin')

const items = ref<ActorSubscription[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const newActorHref = ref('')

async function fetchList(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const res = await listSubscriptions({ limit: 200 })
    items.value = res.items
    total.value = res.total
  } catch {
    error.value = t('library.subscriptions.loadError')
  } finally {
    loading.value = false
  }
}

async function addActor(): Promise<void> {
  const href = newActorHref.value.trim()
  if (!href) return
  try {
    await upsertSubscription(href, { active: true })
    newActorHref.value = ''
    await fetchList()
  } catch {
    message.error(t('library.subscriptions.saveError'))
  }
}

async function toggleActive(row: ActorSubscription, active: boolean): Promise<void> {
  try {
    await upsertSubscription(row.actor_href, { actor_name: row.actor_name, active })
    await fetchList()
  } catch {
    message.error(t('library.subscriptions.saveError'))
  }
}

async function unfollow(row: ActorSubscription): Promise<void> {
  try {
    await deleteSubscription(row.actor_href)
    await fetchList()
  } catch {
    message.error(t('library.subscriptions.saveError'))
  }
}

const columns = computed<DataTableColumns<ActorSubscription>>(() => {
  const cols: DataTableColumns<ActorSubscription> = [
    {
      title: t('library.subscriptions.col.actor'),
      key: 'actor_href',
      render: (row) => row.actor_name || row.actor_href,
    },
    {
      title: t('library.subscriptions.col.active'),
      key: 'active',
      width: 100,
      render: (row) =>
        h(NSwitch, {
          value: row.active,
          disabled: !isAdmin.value,
          'onUpdate:value': (v: boolean) => void toggleActive(row, v),
        }),
    },
    {
      title: t('library.subscriptions.col.lastChecked'),
      key: 'last_checked_at',
      render: (row) =>
        row.last_checked_at ? row.last_checked_at.slice(0, 19).replace('T', ' ') : '—',
    },
  ]
  if (isAdmin.value) {
    cols.push({
      title: t('library.subscriptions.col.actions'),
      key: 'actions',
      width: 120,
      render: (row) =>
        h(
          NButton,
          { size: 'small', tertiary: true, type: 'error', onClick: () => void unfollow(row) },
          { default: () => t('library.subscriptions.unfollow') },
        ),
    })
  }
  return cols
})

onMounted(() => void fetchList())
</script>

<template>
  <NSpin :show="loading">
    <NAlert
      v-if="error"
      type="error"
      class="load-error"
    >
      {{ error }}
      <NButton
        size="small"
        style="margin-left: 12px"
        @click="fetchList"
      >
        {{ t('common.retry') }}
      </NButton>
    </NAlert>

    <NGrid
      :cols="2"
      :x-gap="12"
      :y-gap="12"
      responsive="screen"
      :item-responsive="true"
    >
      <NGi span="2 s:2 m:1">
        <NCard size="small">
          <NStatistic
            :label="t('library.subscriptions.total')"
            :value="total"
          />
        </NCard>
      </NGi>
    </NGrid>

    <NCard
      size="small"
      :title="t('library.subscriptions.followed')"
      class="block"
    >
      <NSpace
        v-if="isAdmin"
        class="add-row"
      >
        <NInput
          v-model:value="newActorHref"
          :placeholder="t('library.subscriptions.addPlaceholder')"
          class="add-input"
          @keyup.enter="addActor"
        />
        <NButton
          type="primary"
          @click="addActor"
        >
          {{ t('library.subscriptions.add') }}
        </NButton>
      </NSpace>
      <NDataTable
        :columns="columns"
        :data="items"
        :bordered="false"
        size="small"
        :row-key="(row: ActorSubscription) => row.actor_href"
      />
    </NCard>
  </NSpin>
</template>

<style scoped>
.load-error {
  margin-bottom: 12px;
}
.block {
  margin-top: 12px;
}
.add-row {
  margin-bottom: 8px;
}
.add-input {
  width: 320px;
}
</style>
