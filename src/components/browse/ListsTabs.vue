<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  NTabs,
  NTabPane,
  NSpace,
  NInput,
  NButton,
  NAlert,
  NSpin,
  useMessage,
} from 'naive-ui'
import { useBrowseStore, type ListsTabKey } from '@/stores/browse'
import { extractErrorMessage } from '@/api/errors'
import ListsGrid from './ListsGrid.vue'

const { t } = useI18n()
const browse = useBrowseStore()
const message = useMessage()

async function onLoad(): Promise<void> {
  try {
    await browse.loadListsPage({ reset: true })
  } catch (err) {
    message.error(extractErrorMessage(err))
  }
}

async function onLoadMore(): Promise<void> {
  try {
    await browse.loadMoreLists()
  } catch (err) {
    message.error(extractErrorMessage(err))
  }
}
</script>

<template>
  <NTabs
    :value="browse.listsTab"
    type="card"
    animated
    size="small"
    @update:value="(v: string) => browse.setListsTab(v as ListsTabKey)"
  >
    <NTabPane name="top" :tab="t('browse.lists.tabs.top')" />
    <NTabPane name="categories" :tab="t('browse.lists.tabs.categories')" />
    <NTabPane name="tags" :tab="t('browse.lists.tabs.tags')" />
    <NTabPane name="custom" :tab="t('browse.lists.tabs.custom')" />
  </NTabs>

  <NSpace align="center" :size="8" wrap style="margin-top: 8px;">
    <NInput
      v-model:value="browse.listsUrl"
      :placeholder="t('browse.lists.urlPlaceholder')"
      style="min-width: 360px; flex: 1;"
      @keyup.enter="onLoad"
    />
    <NButton type="primary" :loading="browse.listsLoading" :disabled="!browse.listsUrl.trim()" @click="onLoad">
      {{ t('browse.lists.load') }}
    </NButton>
  </NSpace>

  <NAlert v-if="browse.listsError" type="warning" :show-icon="true" style="margin-top: 8px;" closable @close="browse.listsError = null">
    {{ extractErrorMessage(browse.listsError) }}
  </NAlert>

  <div style="margin-top: 12px;">
    <NSpin :show="browse.listsLoading && browse.listsCards.length === 0">
      <ListsGrid>
        <template #empty>{{ t('browse.lists.empty') }}</template>
      </ListsGrid>
    </NSpin>
  </div>

  <NSpace v-if="browse.listsHasMore" justify="center" style="margin-top: 16px;">
    <NButton :loading="browse.listsLoading" @click="onLoadMore">
      {{ t('browse.lists.loadMore') }}
    </NButton>
  </NSpace>
</template>
