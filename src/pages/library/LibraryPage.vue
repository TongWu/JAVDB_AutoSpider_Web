<!-- src/pages/library/LibraryPage.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { NTabs, NTabPane } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import AcquisitionView from './AcquisitionView.vue'
import OwnershipView from './OwnershipView.vue'
import ConsumptionView from './ConsumptionView.vue'

const { t } = useI18n()
const activeTab = ref('acquisition')
</script>

<template>
  <div class="library-page">
    <h2>{{ t('nav.library') }}</h2>
    <p class="subtitle">
      {{ t('library.subtitle') }}
    </p>
    <NTabs
      v-model:value="activeTab"
      type="line"
      animated
    >
      <NTabPane
        name="acquisition"
        :tab="t('library.tabs.acquisition')"
      >
        <AcquisitionView />
      </NTabPane>
      <NTabPane
        name="ownership"
        :tab="t('library.tabs.ownership')"
      >
        <OwnershipView />
      </NTabPane>
      <NTabPane
        name="consumption"
        :tab="t('library.tabs.consumption')"
      >
        <ConsumptionView />
      </NTabPane>
    </NTabs>
  </div>
</template>

<style scoped>
.library-page {
  padding: 16px;
}
.subtitle {
  color: var(--n-text-color-3, #888);
  margin-top: -4px;
  margin-bottom: 12px;
}
</style>
