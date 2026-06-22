<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NAlert, NButton, NCard, NDataTable, NGi, NGrid, NSpin, NStatistic,
  useMessage, type DataTableColumns,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import StatusControl from '@/components/StatusControl.vue'
import { listNewWorks, dismissNewWork, type NewWork } from '@/api/new-works'
import { loadErrorMessage } from '@/pages/library/loadError'

const { t } = useI18n()
const message = useMessage()

const items = ref<NewWork[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

async function fetchList(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const res = await listNewWorks({ limit: 200 })
    items.value = res.items
    total.value = res.total
  } catch (err) {
    error.value = loadErrorMessage(err, t, 'library.newWorks.loadError')
  } finally {
    loading.value = false
  }
}

async function dismiss(videoCode: string, actorHref: string): Promise<void> {
  try {
    await dismissNewWork(videoCode, actorHref)
    await fetchList()
  } catch {
    message.error(t('library.newWorks.dismissError'))
  }
}

const columns = computed<DataTableColumns<NewWork>>(() => [
  {
    title: t('library.newWorks.col.videoCode'),
    key: 'video_code',
    render: (row) =>
      h(
        'span',
        { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;' },
        row.video_code,
      ),
  },
  {
    title: t('library.newWorks.col.title'),
    key: 'title',
    render: (row) => row.title || '—',
  },
  {
    title: t('library.newWorks.col.releaseDate'),
    key: 'release_date',
    width: 120,
    render: (row) => row.release_date || '—',
  },
  {
    // One-click "want" reuses WS1's StatusControl (videoCode + href props);
    // setting "want" upserts the WatchIntent row via the byte-mirrored upsert.
    title: t('library.newWorks.col.status'),
    key: 'status',
    width: 140,
    render: (row) =>
      h(StatusControl, {
        videoCode: row.video_code,
        href: row.href,
        initialStatus: null,
      }),
  },
  {
    title: t('library.newWorks.col.actions'),
    key: 'actions',
    width: 110,
    render: (row) =>
      h(
        NButton,
        { size: 'small', tertiary: true, onClick: () => void dismiss(row.video_code, row.actor_href) },
        { default: () => t('library.newWorks.dismiss') },
      ),
  },
])

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
            :label="t('library.newWorks.total')"
            :value="total"
          />
        </NCard>
      </NGi>
    </NGrid>

    <NCard
      size="small"
      :title="t('library.newWorks.recent')"
      class="block"
    >
      <NDataTable
        :columns="columns"
        :data="items"
        :bordered="false"
        size="small"
        :row-key="(row: NewWork) => row.video_code"
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
</style>
