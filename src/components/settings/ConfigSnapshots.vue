<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NAlert, NButton, NCard } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { apiGetConfigConsumers, apiGetJobConfigSnapshots, type ConfigConsumerEvidence } from '@/api/config'

const { t } = useI18n()
const auth = useAuthStore()
const current = ref<ConfigConsumerEvidence[]>([])
const history = ref<ConfigConsumerEvidence[]>([])
const jobId = ref('')
const queriedJobId = ref('')
const busy = ref(false)
const error = ref(false)

async function refresh(): Promise<void> {
  if (auth.role !== 'admin') return
  busy.value = true
  error.value = false
  try { current.value = (await apiGetConfigConsumers()).consumers }
  catch { error.value = true; current.value = [] }
  finally { busy.value = false }
}

async function lookup(): Promise<void> {
  if (auth.role !== 'admin' || !/^[a-zA-Z0-9_-]{1,64}$/.test(jobId.value)) return
  busy.value = true
  error.value = false
  history.value = []
  queriedJobId.value = jobId.value
  try { history.value = (await apiGetJobConfigSnapshots(queriedJobId.value)).consumers }
  catch { error.value = true }
  finally { busy.value = false }
}

onMounted(refresh)
</script>

<template>
  <NCard
    v-if="auth.role === 'admin'"
    :title="t('configSnapshots.title')"
  >
    <p>{{ t('configSnapshots.explanation') }}</p>
    <NAlert
      v-if="error"
      type="warning"
      role="alert"
    >
      {{ t('configSnapshots.unavailable') }}
    </NAlert>
    <NButton
      :loading="busy"
      @click="refresh"
    >
      {{ t('configSnapshots.refresh') }}
    </NButton>
    <form
      class="lookup"
      @submit.prevent="lookup"
    >
      <label for="snapshot-job-id">{{ t('configSnapshots.jobId') }}</label>
      <input
        id="snapshot-job-id"
        v-model="jobId"
        maxlength="64"
        pattern="[a-zA-Z0-9_\-]{1,64}"
        required
      >
      <NButton
        attr-type="submit"
        :disabled="busy || !jobId"
      >
        {{ t('configSnapshots.lookup') }}
      </NButton>
    </form>
    <section
      v-for="group in [{title: t('configSnapshots.current'), rows: current}, {title: queriedJobId, rows: history}]"
      :key="group.title"
    >
      <h4 v-if="group.rows.length">
        {{ group.title }}
      </h4>
      <details
        v-for="consumer in group.rows"
        :key="consumer.consumer"
        class="consumer"
      >
        <summary>{{ consumer.consumer }} · {{ consumer.status }}<span v-if="consumer.reason"> · {{ consumer.reason }}</span></summary>
        <template v-if="consumer.snapshot">
          <p>{{ consumer.snapshot.captured_at }} · {{ consumer.snapshot.scope }}</p>
          <p>{{ t('configSnapshots.partial') }}</p>
          <code class="digest">{{ consumer.digest }}</code>
          <div class="fields">
            <table>
              <thead><tr><th>{{ t('configSnapshots.field') }}</th><th>{{ t('configSnapshots.value') }}</th><th>{{ t('configSnapshots.source') }}</th></tr></thead>
              <tbody>
                <tr
                  v-for="(field, index) in consumer.snapshot.fields"
                  :key="index"
                >
                  <td>{{ field.key }}</td>
                  <td>{{ field.sensitive ? (field.present ? t('configSnapshots.present') : t('configSnapshots.absent')) : field.value }}</td>
                  <td>{{ field.source }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </details>
    </section>
  </NCard>
</template>

<style scoped>
.lookup { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.lookup input { padding: 6px 8px; color: inherit; background: transparent; border: 1px solid #8888; border-radius: 4px; }
.consumer { margin: 8px 0; }
summary { cursor: pointer; overflow-wrap: anywhere; }
.fields { max-height: 300px; overflow: auto; margin-top: 8px; }
th, td { text-align: left; padding: 4px 12px 4px 0; overflow-wrap: anywhere; }
.digest { overflow-wrap: anywhere; }
</style>
