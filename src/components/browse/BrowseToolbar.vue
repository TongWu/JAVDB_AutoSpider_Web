<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NInput,
  NButton,
  NSpace,
  NPopover,
  NList,
  NListItem,
  NIcon,
  useMessage,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useBrowseStore } from '@/stores/browse'
import { extractErrorMessage } from '@/api/errors'

const { t } = useI18n()
const auth = useAuthStore()
const browse = useBrowseStore()
const message = useMessage()

const isAdmin = computed(() => auth.role === 'admin')
const showCookie = ref(false)
const cookieInput = ref('')
const cookieSubmitting = ref(false)

async function onSubmit(): Promise<void> {
  const q = browse.query.trim()
  if (!q) return
  try {
    await browse.submit(q)
  } catch (err) {
    message.error(extractErrorMessage(err))
  }
}

function pickRecent(q: string): void {
  browse.query = q
  void onSubmit()
}

async function uploadCookie(): Promise<void> {
  const c = cookieInput.value.trim()
  if (!c) return
  cookieSubmitting.value = true
  try {
    await browse.syncCookie(c)
    message.success(t('browse.cookieSync.uploaded'))
    showCookie.value = false
    cookieInput.value = ''
  } catch (err) {
    message.error(extractErrorMessage(err))
  } finally {
    cookieSubmitting.value = false
  }
}
</script>

<template>
  <div class="browse-toolbar">
    <NSpace
      align="center"
      :size="8"
      wrap
    >
      <NInput
        v-model:value="browse.query"
        :placeholder="t('browse.toolbar.placeholder')"
        clearable
        style="min-width: 360px;"
        @keyup.enter="onSubmit"
      />
      <NButton
        type="primary"
        :loading="browse.submitting"
        @click="onSubmit"
      >
        {{ t('browse.toolbar.submit') }}
      </NButton>

      <NPopover
        trigger="click"
        placement="bottom-end"
      >
        <template #trigger>
          <NButton
            tertiary
            :disabled="browse.recentSearches.length === 0"
          >
            <template #icon>
              <NIcon>🕘</NIcon>
            </template>
            {{ t('browse.toolbar.recent') }}
          </NButton>
        </template>
        <div style="min-width: 240px;">
          <NList
            v-if="browse.recentSearches.length"
            hoverable
            clickable
          >
            <NListItem
              v-for="q in browse.recentSearches"
              :key="q"
              @click="pickRecent(q)"
            >
              {{ q }}
            </NListItem>
          </NList>
          <p
            v-else
            class="empty"
          >
            {{ t('browse.toolbar.recentEmpty') }}
          </p>
        </div>
      </NPopover>

      <NPopover
        v-if="isAdmin"
        v-model:show="showCookie"
        trigger="manual"
        placement="bottom-end"
      >
        <template #trigger>
          <NButton
            tertiary
            @click="showCookie = !showCookie"
          >
            {{ t('browse.cookieSync.button') }}
          </NButton>
        </template>
        <div style="width: 360px;">
          <p class="popover-hint">
            {{ t('browse.cookieSync.hint') }}
          </p>
          <NInput
            v-model:value="cookieInput"
            type="textarea"
            :rows="3"
            :placeholder="t('browse.cookieSync.placeholder')"
          />
          <NSpace
            justify="end"
            style="margin-top: 8px;"
          >
            <NButton
              size="small"
              @click="showCookie = false"
            >
              {{ t('browse.cookieSync.cancel') }}
            </NButton>
            <NButton
              size="small"
              type="primary"
              :loading="cookieSubmitting"
              :disabled="!cookieInput.trim()"
              @click="uploadCookie"
            >
              {{ t('browse.cookieSync.upload') }}
            </NButton>
          </NSpace>
        </div>
      </NPopover>
    </NSpace>
  </div>
</template>

<style scoped>
.browse-toolbar {
  padding: 12px 0 8px;
}
.empty {
  margin: 4px 8px;
  color: var(--n-text-color-2);
  font-size: 13px;
}
.popover-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--n-text-color-2);
  line-height: 1.4;
}
</style>
