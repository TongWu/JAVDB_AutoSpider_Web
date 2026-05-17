<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div>
    <h1>{{ t('nav.home') }}</h1>
    <p>{{ t('app.tagline') }}</p>
    <p style="color: gray; font-style: italic;">
      Dashboard skeleton coming in Task B4.
    </p>
  </div>
</template>
