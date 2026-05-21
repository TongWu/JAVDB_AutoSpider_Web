<script setup lang="ts">
import { watch } from 'vue'
import { useBrowseStore } from '@/stores/browse'
import { useIndexStatus } from '@/composables/useIndexStatus'
import ListsCard from './ListsCard.vue'

const browse = useBrowseStore()
const { observe, statuses } = useIndexStatus()

// Register every card's href for D1 status lookup as cards arrive. The
// composable batches into <=50-href chunks under a 150 ms debounce so a fresh
// page of cards triggers exactly one network call per chunk.
watch(
  () => browse.listsCards,
  (cards) => {
    for (const c of cards) observe(c.href)
  },
  { immediate: true, deep: false },
)

function statusFor(href: string): { status: 'committed' | 'pending' | 'failed_recent' | 'unknown'; meta?: { session_id?: string | null; last_seen?: string | null; last_error?: string | null } } {
  return statuses.value.get(href) ?? { status: 'unknown' }
}
</script>

<template>
  <div
    v-if="browse.listsCards.length === 0"
    class="empty"
  >
    <slot name="empty">
      No results.
    </slot>
  </div>
  <div
    v-else
    class="lists-grid"
  >
    <ListsCard
      v-for="card in browse.listsCards"
      :key="card.href"
      :card="card"
      :status="statusFor(card.href).status"
      :meta="statusFor(card.href).meta"
    />
  </div>
</template>

<style scoped>
.lists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.empty {
  padding: 32px 0;
  text-align: center;
  color: var(--n-text-color-2);
  font-size: 13px;
}
</style>
