<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { NAlert, NButton, NCard, NInput, NMenu, NSpace } from 'naive-ui'
import {
  listWorkflows,
  getWorkflowContent,
  updateWorkflow,
  type WorkflowItem,
} from '@/api/gh-actions'
import { useCapabilitiesStore } from '@/stores/capabilities'

const { t } = useI18n()
const router = useRouter()
const cap = useCapabilitiesStore()

// ── Access guard ────────────────────────────────────────────────────
const ghTier = computed(() => cap.data?.gh_actions?.tier ?? null)

onMounted(() => {
  const tier = ghTier.value
  if (tier !== null && tier !== 'edit' && tier !== 'admin') {
    void router.replace('/403')
    return
  }
  void fetchWorkflows()
})

watch(ghTier, (tier) => {
  if (tier !== null && tier !== 'edit' && tier !== 'admin') {
    void router.replace('/403')
  }
})

// ── Workflow list ────────────────────────────────────────────────────
const workflows = ref<WorkflowItem[]>([])
const workflowsLoading = ref(false)
const workflowsError = ref<string | null>(null)
const selectedWorkflowName = ref<string | null>(null)

async function fetchWorkflows() {
  workflowsLoading.value = true
  workflowsError.value = null
  try {
    const res = await listWorkflows()
    workflows.value = res.workflows
  } catch (e) {
    workflowsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    workflowsLoading.value = false
  }
}

const workflowMenuOptions = computed(() =>
  workflows.value.map((w) => ({
    label: w.name,
    key: w.name,
  })),
)

// ── Editor state ─────────────────────────────────────────────────────
const content = ref('')
const currentSha = ref('')
const currentPath = ref('')
const contentLoading = ref(false)
const contentError = ref<string | null>(null)

async function loadWorkflowContent(name: string) {
  contentLoading.value = true
  contentError.value = null
  saveError.value = null
  saveWarnings.value = []
  saveSuccess.value = false
  commitMessage.value = `ci: update ${name}`
  try {
    const res = await getWorkflowContent(name)
    content.value = res.content
    currentSha.value = res.sha
    currentPath.value = res.path
  } catch (e) {
    contentError.value = e instanceof Error ? e.message : String(e)
  } finally {
    contentLoading.value = false
  }
}

function onWorkflowSelect(key: string) {
  selectedWorkflowName.value = key
}

watch(selectedWorkflowName, (name) => {
  if (name) void loadWorkflowContent(name)
})

// ── Save / update ────────────────────────────────────────────────────
const commitMessage = ref('')
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveWarnings = ref<string[]>([])
const saveSuccess = ref(false)

async function saveWorkflow() {
  if (!selectedWorkflowName.value || !currentSha.value) return
  saving.value = true
  saveError.value = null
  saveWarnings.value = []
  saveSuccess.value = false
  try {
    const res = await updateWorkflow(selectedWorkflowName.value, {
      content: content.value,
      sha: currentSha.value,
      commit_message: commitMessage.value || `ci: update ${selectedWorkflowName.value}`,
    })
    saveSuccess.value = res.updated
    saveWarnings.value = res.validation_warnings ?? []
    // Reload to get the new SHA after a successful save
    if (res.updated) {
      await loadWorkflowContent(selectedWorkflowName.value)
    }
  } catch (e: unknown) {
    // 409 = SHA conflict, 422 = invalid YAML
    const status = (e as { response?: { status?: number } })?.response?.status
    if (status === 409) {
      saveError.value = 'File changed since loading, please reload'
    } else if (status === 422) {
      saveError.value = e instanceof Error ? e.message : 'Invalid YAML — check syntax and try again'
    } else {
      saveError.value = e instanceof Error ? e.message : String(e)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="editor-page">
    <header class="page-header">
      <div class="page-header-left">
        <h1>{{ t('nav.workflows') }}</h1>
        <p class="subtitle">
          Edit GitHub Actions workflow YAML files
        </p>
      </div>
    </header>

    <div class="editor-layout">
      <!-- Workflow file list -->
      <NCard
        class="workflow-list"
        title="Workflow Files"
        size="small"
      >
        <template #header-extra>
          <NButton
            size="tiny"
            :loading="workflowsLoading"
            @click="fetchWorkflows"
          >
            {{ t('common.retry') }}
          </NButton>
        </template>

        <NAlert
          v-if="workflowsError"
          type="error"
          closable
          style="margin-bottom: 8px"
          @close="workflowsError = null"
        >
          {{ workflowsError }}
        </NAlert>

        <NMenu
          :options="workflowMenuOptions"
          :value="selectedWorkflowName ?? undefined"
          @update:value="onWorkflowSelect"
        />
      </NCard>

      <!-- Editor panel -->
      <NCard
        class="editor-main"
        size="small"
      >
        <template #header>
          <span v-if="selectedWorkflowName">{{ currentPath || selectedWorkflowName }}</span>
          <span v-else>Select a workflow to edit</span>
        </template>

        <NAlert
          v-if="contentError"
          type="error"
          closable
          style="margin-bottom: 8px"
          @close="contentError = null"
        >
          {{ contentError }}
        </NAlert>

        <NAlert
          v-if="saveError"
          type="error"
          closable
          style="margin-bottom: 8px"
          @close="saveError = null"
        >
          {{ saveError }}
        </NAlert>

        <NAlert
          v-if="saveSuccess && saveWarnings.length === 0"
          type="success"
          closable
          style="margin-bottom: 8px"
          @close="saveSuccess = false"
        >
          Workflow saved successfully.
        </NAlert>

        <NAlert
          v-if="saveWarnings.length > 0"
          type="warning"
          closable
          style="margin-bottom: 8px"
          @close="saveWarnings = []"
        >
          <div
            v-for="(w, i) in saveWarnings"
            :key="i"
          >
            {{ w }}
          </div>
        </NAlert>

        <NInput
          v-model:value="content"
          type="textarea"
          :loading="contentLoading"
          :disabled="!selectedWorkflowName || contentLoading"
          :rows="28"
          :input-props="{ spellcheck: false }"
          class="yaml-editor"
          placeholder="Select a workflow file from the left panel to start editing."
        />

        <!-- Bottom bar -->
        <div class="bottom-bar">
          <NInput
            v-model:value="commitMessage"
            size="small"
            :placeholder="`ci: update ${selectedWorkflowName ?? 'workflow'}`"
            :disabled="!selectedWorkflowName"
            class="commit-input"
          />
          <NSpace>
            <NButton
              size="small"
              :disabled="!selectedWorkflowName || contentLoading"
              @click="selectedWorkflowName && loadWorkflowContent(selectedWorkflowName)"
            >
              Reload
            </NButton>
            <NButton
              type="primary"
              size="small"
              :loading="saving"
              :disabled="!selectedWorkflowName || contentLoading || !content"
              @click="saveWorkflow"
            >
              Save
            </NButton>
          </NSpace>
        </div>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.editor-page {
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

.editor-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.workflow-list {
  width: 260px;
  flex-shrink: 0;
}

.editor-main {
  flex: 1;
  min-width: 0;
}

.yaml-editor :deep(textarea) {
  font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.5;
  tab-size: 2;
}

.bottom-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.commit-input {
  flex: 1;
}
</style>
