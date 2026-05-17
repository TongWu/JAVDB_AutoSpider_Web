<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NTabs, NTabPane } from 'naive-ui'
import { useBrowseStore, type BrowseMode } from '@/stores/browse'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const browse = useBrowseStore()

// Hydrate mode from query string on mount.
const initialMode = (route.query.mode as BrowseMode | undefined) ?? 'resolve'
if (initialMode === 'resolve' || initialMode === 'lists' || initialMode === 'preview') {
  browse.setMode(initialMode)
}

// Initial query string seeded into the search input (so deep-link search works).
const initialQuery = (route.query.q as string | undefined) ?? ''
if (initialQuery) browse.query = initialQuery

watch(
  () => browse.mode,
  (m) => {
    if (route.query.mode !== m) {
      void router.replace({ query: { ...route.query, mode: m } })
    }
  },
)
</script>

<template>
  <NTabs
    :value="browse.mode"
    type="line"
    animated
    @update:value="(v: string) => browse.setMode(v as BrowseMode)"
  >
    <NTabPane name="resolve" :tab="t('browse.tabs.resolve')">
      <slot name="resolve" />
    </NTabPane>
    <NTabPane name="lists" :tab="t('browse.tabs.lists')">
      <slot name="lists" />
    </NTabPane>
    <NTabPane name="preview" :tab="t('browse.tabs.preview')">
      <slot name="preview" />
    </NTabPane>
  </NTabs>
</template>
