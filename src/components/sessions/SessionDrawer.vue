<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NDrawer,
  NDrawerContent,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NTabs,
  NTabPane,
  NDataTable,
  NSpin,
  NSpace,
  NButton,
  NEmpty,
  type DataTableColumns,
} from 'naive-ui'
import StateBadge from './StateBadge.vue'
import { useSessionsStore } from '@/stores/sessions'
import type { SessionItem, SessionDetailResponse } from '@/api/sessions'

const props = defineProps<{ show: boolean; session: SessionItem | null }>()
const emit = defineEmits<{
  'update:show': [val: boolean]
  rollback: [session: SessionItem]
  commit: [session: SessionItem]
}>()

const { t } = useI18n()
const sessions = useSessionsStore()

const detail = ref<SessionDetailResponse | null>(null)
const loadError = ref<unknown>(null)

const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
})

const state = computed(() => String(props.session?.state ?? '').toLowerCase())
const canRollback = computed(() => {
  // Rollback is meaningful for any session that has writes, including committed ones.
  // BE rejects double rollbacks itself; we just disable for empty/unknown rows.
  return !!props.session && state.value !== ''
})
const canCommit = computed(() => state.value === 'finalizing')

async function loadDetail(force = false): Promise<void> {
  if (!props.session?.session_id) return
  detail.value = null
  loadError.value = null
  try {
    detail.value = await sessions.getDetail(props.session.session_id, force)
  } catch (err) {
    loadError.value = err
  }
}

watch(
  () => [props.show, props.session?.session_id],
  ([show]) => {
    if (show) void loadDetail()
  },
  { immediate: true },
)

defineExpose({ refreshDetail: () => loadDetail(true) })

function formatTimestamp(ts?: string): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

const moviesColumns = computed<DataTableColumns<Record<string, unknown>>>(() => [
  { title: 'Title', key: 'title', render: (row) => String(row.title ?? row.Title ?? '—') },
  { title: 'Code', key: 'code', render: (row) => String(row.code ?? row.video_code ?? row.VideoCode ?? '—') },
  { title: 'Href', key: 'href', render: (row) => String(row.href ?? row.Href ?? '—') },
])

const torrentsColumns = computed<DataTableColumns<Record<string, unknown>>>(() => [
  { title: 'Code', key: 'code', render: (row) => String(row.code ?? row.video_code ?? row.VideoCode ?? '—') },
  { title: 'Magnet', key: 'magnet', render: (row) => {
    const m = String(row.magnet ?? row.Magnet ?? '')
    return m.length > 60 ? m.slice(0, 60) + '…' : m || '—'
  } },
  { title: 'Size', key: 'size', render: (row) => String(row.size ?? row.Size ?? '—') },
])
</script>

<template>
  <NDrawer v-model:show="visible" :width="720" placement="right">
    <NDrawerContent
      v-if="props.session"
      :title="props.session.session_id ?? t('sessions.drawer.untitled')"
      :native-scrollbar="false"
    >
      <NDescriptions :column="2" size="small" label-placement="left">
        <NDescriptionsItem :label="t('sessions.col.sessionId')">
          <code>{{ props.session.session_id }}</code>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('sessions.col.state')">
          <StateBadge :state="props.session.state" />
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('sessions.col.writeMode')">
          {{ props.session.write_mode ?? '—' }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('sessions.col.run')">
          {{
            props.session.run_id
              ? `${props.session.run_id}${props.session.run_attempt != null ? '/' + props.session.run_attempt : ''}`
              : '—'
          }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('sessions.col.created')">
          {{ formatTimestamp(props.session.created_at) }}
        </NDescriptionsItem>
      </NDescriptions>

      <NDivider />

      <NSpin :show="sessions.detailLoading && !detail">
        <div v-if="loadError" style="padding: 16px 0;">
          <NEmpty :description="t('sessions.drawer.loadFailed')" />
        </div>
        <NTabs v-else-if="detail" default-value="movies" type="line" animated>
          <NTabPane name="movies" :tab="`${t('sessions.drawer.movies')} (${detail.movies.length})`">
            <NDataTable
              v-if="detail.movies.length > 0"
              :columns="moviesColumns"
              :data="detail.movies"
              size="small"
              striped
              flex-height
              style="min-height: 200px;"
            />
            <NEmpty v-else :description="t('sessions.drawer.noMovies')" />
          </NTabPane>
          <NTabPane name="torrents" :tab="`${t('sessions.drawer.torrents')} (${detail.torrents.length})`">
            <NDataTable
              v-if="detail.torrents.length > 0"
              :columns="torrentsColumns"
              :data="detail.torrents"
              size="small"
              striped
              flex-height
              style="min-height: 200px;"
            />
            <NEmpty v-else :description="t('sessions.drawer.noTorrents')" />
          </NTabPane>
        </NTabs>
        <div v-else style="min-height: 120px;" />
      </NSpin>

      <NDivider />

      <NSpace>
        <NButton
          type="warning"
          :disabled="!canRollback"
          @click="props.session && emit('rollback', props.session)"
        >
          {{ t('sessions.action.rollback') }}
        </NButton>
        <NButton
          v-if="canCommit"
          type="primary"
          @click="props.session && emit('commit', props.session)"
        >
          {{ t('sessions.action.commit') }}
        </NButton>
      </NSpace>
    </NDrawerContent>
  </NDrawer>
</template>
