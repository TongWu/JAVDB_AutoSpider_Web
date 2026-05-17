<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NAlert, NSpin } from 'naive-ui'
import BrowseToolbar from '@/components/browse/BrowseToolbar.vue'
import BrowseTabs from '@/components/browse/BrowseTabs.vue'
import ResolveCard from '@/components/browse/ResolveCard.vue'
import ListsTabs from '@/components/browse/ListsTabs.vue'
import PreviewFrame from '@/components/browse/PreviewFrame.vue'
import { useBrowseStore } from '@/stores/browse'
import { extractErrorMessage } from '@/api/errors'

const { t } = useI18n()
const browse = useBrowseStore()
</script>

<template>
  <div class="browse-page">
    <header class="page-head">
      <h1>{{ t('browse.title') }}</h1>
      <p class="muted">{{ t('browse.subtitle') }}</p>
    </header>

    <BrowseToolbar />

    <NAlert v-if="browse.error" type="warning" :show-icon="true" closable @close="browse.error = null">
      {{ extractErrorMessage(browse.error) }}
    </NAlert>

    <BrowseTabs>
      <template #resolve>
        <NSpin :show="browse.submitting">
          <ResolveCard v-if="browse.lastResolve" :result="browse.lastResolve" />
          <div v-else class="empty">{{ t('browse.resolve.empty') }}</div>
        </NSpin>
      </template>
      <template #lists>
        <ListsTabs />
      </template>
      <template #preview>
        <PreviewFrame />
      </template>
    </BrowseTabs>
  </div>
</template>

<style scoped>
.browse-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}
.page-head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}
.muted {
  margin: 4px 0 0;
  color: var(--n-text-color-2);
  font-size: 13px;
}
.empty {
  padding: 32px 0;
  text-align: center;
  color: var(--n-text-color-2);
  font-size: 13px;
}
</style>
