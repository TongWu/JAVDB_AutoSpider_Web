<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NInput,
  NSpace,
  NSpin,
  NTag,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  getQualityEvidence,
  listQualityEvaluations,
  type TorrentQualityEvaluation,
  type TorrentQualityEvidence,
} from '@/api/quality-review'
import { extractErrorMessage } from '@/api/errors'

const { t } = useI18n()
const DASH = '—'

// ── List state ──────────────────────────────────────────────────────
const evaluations = ref<TorrentQualityEvaluation[]>([])
const listLoading = ref(false)
const listError = ref<string | null>(null)
const movieHrefFilter = ref('')
let listReqSeq = 0

async function fetchEvaluations() {
  const reqSeq = ++listReqSeq
  listLoading.value = true
  listError.value = null
  try {
    const href = movieHrefFilter.value.trim()
    const res = await listQualityEvaluations(href ? { movie_href: href } : { limit: 50 })
    if (reqSeq === listReqSeq) evaluations.value = res.items
  } catch (e) {
    if (reqSeq === listReqSeq) listError.value = extractErrorMessage(e)
  } finally {
    if (reqSeq === listReqSeq) listLoading.value = false
  }
}

onMounted(() => {
  void fetchEvaluations()
})

// ── Formatting helpers ──────────────────────────────────────────────
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return DASH
  // `< 1` (not `<= 0`) also guards fractional bytes 0<b<1, where log() would make
  // the unit index negative and yield "undefined".
  if (bytes < 1) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

function formatRatio(ratio: number | null): string {
  if (ratio === null || ratio === undefined) return DASH
  return `${(ratio * 100).toFixed(2)}%`
}

function formatScore(score: number | null): string {
  return score === null || score === undefined ? DASH : score.toFixed(2)
}

function consistencyTag(value: boolean | null) {
  if (value === null) return h(NTag, { size: 'small', type: 'default' }, () => DASH)
  return value
    ? h(NTag, { size: 'small', type: 'success' }, () => t('quality.consistent.yes'))
    : h(NTag, { size: 'small', type: 'error' }, () => t('quality.consistent.no'))
}

// ── Table columns ───────────────────────────────────────────────────
const columns = computed<DataTableColumns<TorrentQualityEvaluation>>(() => [
  {
    title: t('quality.col.movie'),
    key: 'movie',
    width: 140,
    render: (row) => row.video_code ?? row.movie_href,
  },
  {
    title: t('quality.col.category'),
    key: 'category',
    width: 170,
    render: (row) => `${row.javdb_category ?? DASH} → ${row.inferred_category ?? DASH}`,
  },
  {
    title: t('quality.col.consistent'),
    key: 'category_consistent',
    width: 110,
    render: (row) => consistencyTag(row.category_consistent ?? null),
  },
  {
    title: t('quality.col.score'),
    key: 'score',
    width: 80,
    render: (row) => formatScore(row.score ?? null),
  },
  {
    // Not yet scored (Python IMP-08) — render muted when null.
    title: t('quality.col.shadowRank'),
    key: 'shadow_rank',
    width: 110,
    render: (row) => row.shadow_rank ?? DASH,
  },
  {
    title: t('quality.col.wouldReplace'),
    key: 'would_replace_current_choice',
    width: 130,
    render: (row) =>
      row.would_replace_current_choice === null || row.would_replace_current_choice === undefined
        ? h('span', { class: 'muted' }, t('quality.notScored'))
        : row.would_replace_current_choice
          ? t('common.yes')
          : t('common.no'),
  },
  {
    title: t('quality.col.decision'),
    key: 'decision',
    width: 110,
    render: (row) =>
      row.decision ?? h('span', { class: 'muted' }, t('quality.notScored')),
  },
  {
    title: t('quality.col.reasons'),
    key: 'reasons',
    ellipsis: { tooltip: true },
    render: (row) => (row.reasons.length ? row.reasons.join(', ') : DASH),
  },
  {
    title: t('quality.col.infoHash'),
    key: 'info_hash',
    width: 130,
    ellipsis: { tooltip: true },
    render: (row) => row.info_hash,
  },
])

// ── Drawer / evidence drill-down ────────────────────────────────────
const drawerOpen = ref(false)
const selected = ref<TorrentQualityEvaluation | null>(null)

const evidence = ref<TorrentQualityEvidence | null>(null)
const evidenceLoading = ref(false)
const evidenceMissing = ref(false)
const evidenceError = ref<string | null>(null)
let evidenceReqSeq = 0

function openDetail(row: TorrentQualityEvaluation) {
  selected.value = row
  drawerOpen.value = true
}

async function fetchEvidence(infoHash: string) {
  const reqSeq = ++evidenceReqSeq
  evidenceLoading.value = true
  evidenceMissing.value = false
  evidenceError.value = null
  evidence.value = null
  try {
    const res = await getQualityEvidence(infoHash)
    if (reqSeq === evidenceReqSeq) evidence.value = res
  } catch (e) {
    if (reqSeq !== evidenceReqSeq) return
    const status = (e as { response?: { status?: number } }).response?.status
    if (status === 404) evidenceMissing.value = true
    else evidenceError.value = extractErrorMessage(e)
  } finally {
    if (reqSeq === evidenceReqSeq) evidenceLoading.value = false
  }
}

watch(selected, (row) => {
  if (row) void fetchEvidence(row.info_hash)
  else {
    evidence.value = null
    evidenceMissing.value = false
    evidenceError.value = null
  }
})
</script>

<template>
  <div class="quality-page">
    <!-- Page header -->
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('quality.title') }}</h1>
        <p class="subtitle">
          {{ t('quality.subtitle') }}
        </p>
      </div>
      <NButton
        size="small"
        :loading="listLoading"
        @click="() => void fetchEvaluations()"
      >
        {{ t('common.retry') }}
      </NButton>
    </header>

    <!-- Shadow-data caveat (ADR-024 Phase 2: scoring not yet populated) -->
    <NAlert
      type="info"
      :show-icon="true"
    >
      {{ t('quality.shadowNote') }}
    </NAlert>

    <!-- Filter + table -->
    <NCard :title="t('quality.title')">
      <NSpace
        :size="8"
        style="margin-bottom: 12px"
        wrap
      >
        <NInput
          v-model:value="movieHrefFilter"
          :placeholder="t('quality.filter.movieHref')"
          clearable
          size="small"
          style="width: 280px"
          @keyup.enter="() => void fetchEvaluations()"
          @clear="() => void fetchEvaluations()"
        />
        <NButton
          size="small"
          type="primary"
          :loading="listLoading"
          @click="() => void fetchEvaluations()"
        >
          {{ t('quality.filter.apply') }}
        </NButton>
      </NSpace>

      <NAlert
        v-if="listError"
        type="error"
        closable
        style="margin-bottom: 12px"
        @close="listError = null"
      >
        {{ listError }}
      </NAlert>

      <NSpin :show="listLoading">
        <div
          v-if="!listLoading && evaluations.length === 0 && !listError"
          class="empty-hint"
        >
          {{ t('quality.empty') }}
        </div>
        <NDataTable
          v-else
          :columns="columns"
          :data="evaluations"
          :row-key="(row: TorrentQualityEvaluation) => `${row.info_hash}:${row.movie_href}:${row.scoring_version}`"
          :row-props="(row: TorrentQualityEvaluation) => ({ style: 'cursor: pointer', onClick: () => openDetail(row) })"
          size="small"
          :scroll-x="1180"
        />
      </NSpin>
    </NCard>

    <!-- Detail drawer -->
    <NDrawer
      v-model:show="drawerOpen"
      :width="560"
      placement="right"
    >
      <NDrawerContent
        v-if="selected"
        :title="selected.video_code ?? selected.movie_href"
        closable
      >
        <!-- Evaluation -->
        <div class="detail-section">
          <div class="detail-section-title">
            {{ t('quality.detail.evaluation') }}
          </div>
          <NDescriptions
            bordered
            :column="1"
            label-placement="left"
            size="small"
          >
            <NDescriptionsItem :label="t('quality.field.videoCode')">
              {{ selected.video_code ?? DASH }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.field.movieHref')">
              {{ selected.movie_href }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.field.scoringVersion')">
              {{ selected.scoring_version }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.field.javdbCategory')">
              {{ selected.javdb_category ?? DASH }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.field.inferredCategory')">
              {{ selected.inferred_category ?? DASH }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.col.consistent')">
              <NTag
                size="small"
                :type="selected.category_consistent === null || selected.category_consistent === undefined
                  ? 'default'
                  : selected.category_consistent ? 'success' : 'error'"
              >
                {{ selected.category_consistent === null || selected.category_consistent === undefined
                  ? DASH
                  : selected.category_consistent ? t('quality.consistent.yes') : t('quality.consistent.no') }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.field.magnetName')">
              {{ selected.magnet_name ?? DASH }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.field.subtitleEvidence')">
              {{ selected.subtitle_evidence ?? DASH }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.col.score')">
              {{ formatScore(selected.score ?? null) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.col.shadowRank')">
              {{ selected.shadow_rank ?? t('quality.notScored') }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.col.wouldReplace')">
              {{ selected.would_replace_current_choice === null || selected.would_replace_current_choice === undefined
                ? t('quality.notScored')
                : selected.would_replace_current_choice ? t('common.yes') : t('common.no') }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.field.policyMode')">
              {{ selected.policy_mode ?? t('quality.notScored') }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="t('quality.col.decision')">
              {{ selected.decision ?? t('quality.notScored') }}
            </NDescriptionsItem>
          </NDescriptions>

          <div
            v-if="selected.reasons.length"
            class="detail-subsection"
          >
            <div class="detail-section-title">
              {{ t('quality.detail.reasons') }}
            </div>
            <NSpace
              :size="4"
              wrap
            >
              <NTag
                v-for="(reason, i) in selected.reasons"
                :key="i"
                size="small"
              >
                {{ reason }}
              </NTag>
            </NSpace>
          </div>
        </div>

        <!-- Production-download evidence drill-down -->
        <div class="detail-section">
          <div class="detail-section-title">
            {{ t('quality.detail.evidence') }}
          </div>
          <NSpin :show="evidenceLoading">
            <NAlert
              v-if="evidenceError"
              type="error"
              size="small"
            >
              {{ evidenceError }}
            </NAlert>
            <NEmpty
              v-else-if="evidenceMissing"
              :description="t('quality.detail.evidenceMissing')"
              size="small"
              style="padding: 16px 0"
            />
            <template v-else-if="evidence">
              <NDescriptions
                bordered
                :column="1"
                label-placement="left"
                size="small"
              >
                <NDescriptionsItem :label="t('quality.evidence.probeTarget')">
                  {{ evidence.probe_target_name ?? DASH }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.metadataStatus')">
                  {{ evidence.metadata_status ?? DASH }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.totalSize')">
                  {{ formatBytes(evidence.total_size_bytes ?? null) }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.mainVideoSize')">
                  {{ formatBytes(evidence.main_video_size_bytes ?? null) }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.mainVideoRatio')">
                  {{ formatRatio(evidence.main_video_ratio ?? null) }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.videoFiles')">
                  {{ evidence.video_file_count ?? DASH }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.subtitleFiles')">
                  {{ evidence.subtitle_file_count ?? DASH }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.nonVideoFiles')">
                  {{ evidence.non_video_file_count ?? DASH }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.junkSize')">
                  {{ formatBytes(evidence.junk_size_bytes ?? null) }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.junkRatio')">
                  {{ formatRatio(evidence.junk_size_ratio ?? null) }}
                </NDescriptionsItem>
                <NDescriptionsItem :label="t('quality.evidence.suspiciousFiles')">
                  {{ evidence.suspicious_file_count ?? DASH }}
                </NDescriptionsItem>
              </NDescriptions>

              <div
                v-if="evidence.reasons.length"
                class="detail-subsection"
              >
                <div class="detail-section-title">
                  {{ t('quality.detail.reasons') }}
                </div>
                <NSpace
                  :size="4"
                  wrap
                >
                  <NTag
                    v-for="(reason, i) in evidence.reasons"
                    :key="i"
                    size="small"
                  >
                    {{ reason }}
                  </NTag>
                </NSpace>
              </div>
            </template>
          </NSpin>
        </div>

        <!-- Operator review — STUB. The Python write contract now exists on main
             (POST /api/quality/review-labels), but this SPA talks to the TS Worker
             backend, which has not mirrored it yet. Controls stay disabled until
             that ADR-018 dual-backend follow-up lands. See ADR-024 /
             IMP-ADR024-08-phase2-assist.md in the Python repo. -->
        <div class="detail-section">
          <div class="detail-section-title">
            {{ t('quality.review.title') }}
          </div>
          <NAlert
            type="warning"
            size="small"
            :show-icon="true"
            style="margin-bottom: 8px"
          >
            {{ t('quality.review.comingSoon') }}
          </NAlert>
          <NSpace :size="8">
            <NButton
              size="small"
              type="success"
              disabled
            >
              {{ t('quality.review.accept') }}
            </NButton>
            <NButton
              size="small"
              type="error"
              disabled
            >
              {{ t('quality.review.reject') }}
            </NButton>
          </NSpace>
        </div>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
.quality-page {
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

.detail-section {
  margin-bottom: 20px;
}

.detail-subsection {
  margin-top: 12px;
}

.detail-section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--n-text-color-3);
  margin-bottom: 8px;
}

.muted {
  color: var(--n-text-color-3);
}
</style>
