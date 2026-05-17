<script setup lang="ts">
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent } from 'naive-ui'
import { useUiStore } from '@/stores/ui'
import Sidebar from './Sidebar.vue'
import TopBar from './TopBar.vue'

const ui = useUiStore()
</script>

<template>
  <NLayout
    has-sider
    style="height: 100vh"
  >
    <NLayoutSider
      :collapsed="ui.sidebarCollapsed"
      :width="240"
      :collapsed-width="64"
      collapse-mode="width"
      bordered
    >
      <Sidebar />
    </NLayoutSider>
    <NLayout>
      <NLayoutHeader
        bordered
        style="height: 56px;"
      >
        <TopBar />
      </NLayoutHeader>
      <NLayoutContent content-style="padding: 24px;">
        <slot />
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>
