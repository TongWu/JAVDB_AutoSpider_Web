<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NInput, NSpace, NButton, NSwitch, NScrollbar, NTag, NEmpty } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useLogStream } from '@/composables/useLogStream'

const props = defineProps<{ jobId: string }>()

const { t } = useI18n()
const { stream } = useLogStream(() => props.jobId)

const filterText = ref('')
const autoScroll = ref(true)
const scrollbarRef = ref<{ scrollTo: (opts: { top: number }) => void } | null>(null)
const contentRef = ref<HTMLDivElement | null>(null)

const filtered = computed(() => {
  const allLines = stream.value?.lines ?? []
  if (!filterText.value.trim()) return allLines
  const q = filterText.value.toLowerCase()
  return allLines.filter((l) => l.toLowerCase().includes(q))
})

watch(filtered, async () => {
  if (autoScroll.value && contentRef.value) {
    await nextTick()
    scrollbarRef.value?.scrollTo({ top: contentRef.value.scrollHeight })
  }
}, { flush: 'post' })

function copyAll() {
  void navigator.clipboard.writeText((stream.value?.lines ?? []).join('\n'))
}

function lineClass(line: string): string {
  if (/error|ERROR/.test(line)) return 'log-err'
  if (/warn|WARN/.test(line)) return 'log-warn'
  if (/info|INFO/.test(line)) return 'log-info'
  return ''
}
</script>

<template>
  <div class="log-stream">
    <div class="toolbar">
      <NInput
        v-model:value="filterText"
        size="small"
        clearable
        :placeholder="t('run.log.filterPlaceholder')"
        style="max-width: 320px"
      />
      <NSpace
        align="center"
        size="small"
      >
        <NSwitch
          v-model:value="autoScroll"
          size="small"
        />
        <span style="font-size: 12px; color: var(--n-text-color-2)">{{ t('run.log.autoScroll') }}</span>
        <NButton
          size="small"
          tertiary
          @click="copyAll"
        >
          {{ t('run.log.copyAll') }}
        </NButton>
        <NTag
          v-if="stream"
          :type="stream.done ? 'success' : 'info'"
          size="small"
          round
        >
          {{ stream.done ? t('run.log.done') : t('run.log.live') }} · {{ stream.lines.length }} lines
        </NTag>
      </NSpace>
    </div>

    <NScrollbar
      ref="scrollbarRef"
      style="max-height: 480px; min-height: 200px;"
    >
      <div
        ref="contentRef"
        class="log-content"
      >
        <NEmpty
          v-if="filtered.length === 0"
          :description="t('run.log.empty')"
        />
        <div
          v-for="(line, idx) in filtered"
          :key="idx"
          :class="['log-line', lineClass(line)]"
        >
          {{ line }}
        </div>
      </div>
    </NScrollbar>
  </div>
</template>

<style scoped>
.log-stream { display: flex; flex-direction: column; gap: 12px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.log-content {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  padding: 12px;
  background: var(--n-code-color, #1a1820);
  color: #d4d4d4;
  border-radius: 8px;
}
.log-line { white-space: pre-wrap; word-break: break-word; }
.log-err { color: #f87171; }
.log-warn { color: #fbbf24; }
.log-info { color: #93c5fd; }
</style>
