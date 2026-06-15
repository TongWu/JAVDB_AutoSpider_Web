<!-- src/pages/library/LibraryPage.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NTabs, NTabPane } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useCapabilitiesStore } from '@/stores/capabilities'
import AcquisitionView from './AcquisitionView.vue'
import OwnershipView from './OwnershipView.vue'
import ConsumptionView from './ConsumptionView.vue'
import WatchlistView from './WatchlistView.vue'
import SubscriptionsView from './SubscriptionsView.vue'
import NewWorksView from './NewWorksView.vue'

const { t } = useI18n()
const cap = useCapabilitiesStore()
const activeTab = ref('acquisition')

// Gate the ownership/consumption tabs on their backing-table capability flags
// (ADR-034). Acquisition is always available. Match Sidebar's idiom of reading
// cap.data?.features inside a computed; when features is absent (still loading)
// the flags read undefined → falsy, so gated tabs stay hidden until known.
const features = computed(() => cap.data?.features)
const showOwnership = computed(() => !!features.value?.library_ownership)
const showConsumption = computed(() => !!features.value?.library_consumption)
const showWatchlist = computed(() => !!features.value?.watch_intent)

const showSubscriptions = computed(() => !!features.value?.subscriptions)

const visibleTabs = computed(() => {
  const tabs = ['acquisition']
  if (showOwnership.value) tabs.push('ownership')
  if (showConsumption.value) tabs.push('consumption')
  if (showWatchlist.value) tabs.push('watchlist')
  if (showSubscriptions.value) {
    tabs.push('subscriptions')
    tabs.push('new-works')
  }
  return tabs
})

// Capabilities can resolve after mount, so a tab the user landed on may become
// hidden. Whenever activeTab is not in the visible set, fall back to acquisition.
watch(
  visibleTabs,
  (tabs) => {
    if (!tabs.includes(activeTab.value)) activeTab.value = 'acquisition'
  },
  { immediate: true },
)
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
        v-if="showOwnership"
        name="ownership"
        :tab="t('library.tabs.ownership')"
      >
        <OwnershipView />
      </NTabPane>
      <NTabPane
        v-if="showConsumption"
        name="consumption"
        :tab="t('library.tabs.consumption')"
      >
        <ConsumptionView />
      </NTabPane>
      <NTabPane
        v-if="showWatchlist"
        name="watchlist"
        :tab="t('library.tabs.watchlist')"
      >
        <WatchlistView />
      </NTabPane>
      <NTabPane
        v-if="showSubscriptions"
        name="subscriptions"
        :tab="t('library.tabs.subscriptions')"
      >
        <SubscriptionsView />
      </NTabPane>
      <NTabPane
        v-if="showSubscriptions"
        name="new-works"
        :tab="t('library.tabs.newWorks')"
      >
        <NewWorksView />
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
