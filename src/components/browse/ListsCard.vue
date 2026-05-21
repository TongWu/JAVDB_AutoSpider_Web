<script setup lang="ts">
import { useBrowseStore, type ListsCardData } from '@/stores/browse'
import D1StatusDot, { type IndexStatus, type IndexStatusMeta } from './D1StatusDot.vue'

const props = defineProps<{
  card: ListsCardData
  status: IndexStatus
  meta?: IndexStatusMeta
}>()

const browse = useBrowseStore()

async function open(): Promise<void> {
  browse.setMode('resolve')
  try {
    await browse.submit(props.card.href)
  } catch {
    /* error is surfaced via the page-level alert */
  }
}
</script>

<template>
  <button
    class="lists-card"
    type="button"
    @click="open"
  >
    <div class="thumb-wrap">
      <img
        v-if="props.card.thumbnail"
        :src="props.card.thumbnail"
        :alt="props.card.title"
        class="thumb"
        loading="lazy"
        decoding="async"
      >
      <div
        v-else
        class="thumb thumb-placeholder"
      >
        —
      </div>
      <span class="dot-overlay">
        <D1StatusDot
          :status="props.status"
          :meta="props.meta"
        />
      </span>
    </div>
    <div class="meta-row">
      <span
        v-if="props.card.code"
        class="code"
      >{{ props.card.code }}</span>
      <span
        class="title"
        :title="props.card.title"
      >{{ props.card.title || '—' }}</span>
    </div>
  </button>
</template>

<style scoped>
.lists-card {
  appearance: none;
  background: transparent;
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  transition: transform 120ms ease, box-shadow 120ms ease;
  content-visibility: auto;
  contain-intrinsic-size: 320px 240px;
}
.lists-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
}
.thumb-wrap {
  position: relative;
  aspect-ratio: 16 / 11;
  background: var(--n-color-modal);
  overflow: hidden;
}
.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--n-text-color-3);
  font-size: 24px;
}
.dot-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 999px;
  padding: 4px;
  line-height: 0;
}
.meta-row {
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 50px;
}
.code {
  font-size: 11px;
  font-weight: 600;
  color: var(--n-primary-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.title {
  font-size: 13px;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
