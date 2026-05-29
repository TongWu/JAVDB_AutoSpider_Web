import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en.json'
import StatsPage from '@/pages/stats/StatsPage.vue'

vi.mock('@/api/stats', () => ({
  getStatsSummary: vi.fn().mockResolvedValue({
    total_runs: 0,
    success_rate: null,
    avg_duration_seconds: null,
    total_movies: 0,
    total_torrents: 0,
    total_pikpak: 0,
    total_dedup_freed_bytes: 0,
    proxy_bans_last_7d: 0,
  }),
  getStatsTrend: vi.fn().mockResolvedValue({
    metric: 'test',
    period: '30d',
    data_points: [],
  }),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en },
})

const passthrough = {
  template: '<div><slot /></div>',
}

const tabPaneStub = {
  props: ['tab'],
  template: '<section :data-tab="tab"><h2>{{ tab }}</h2><slot /></section>',
}

describe('StatsPage', () => {
  it('renders ADR-027 tab groups and tab components', () => {
    const wrapper = mount(StatsPage, {
      global: {
        plugins: [i18n],
        stubs: {
          NAlert: passthrough,
          NButton: passthrough,
          NCard: passthrough,
          NGi: passthrough,
          NGrid: passthrough,
          NSelect: passthrough,
          NSpin: passthrough,
          NStatistic: {
            props: ['label', 'value'],
            template: '<div>{{ label }} {{ value }}</div>',
          },
          NTabs: passthrough,
          NTabPane: tabPaneStub,
          Tabs: passthrough,
          TabPane: tabPaneStub,
          Line: true,
          Bar: true,
          Doughnut: true,
          RunsOverviewTab: true,
          SpiderDetailTab: true,
          ContentQualityTab: true,
          ContentCoverageTab: true,
          UploadQbTab: true,
          UploadPikpakTab: true,
          SystemInfraTab: true,
          SystemOpsTab: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Run Metrics')
    expect(wrapper.text()).toContain('Content')
    expect(wrapper.text()).toContain('Upload')
    expect(wrapper.text()).toContain('Growth')
    expect(wrapper.text()).toContain('System')

    const tabLabels = wrapper
      .findAll('[data-tab]')
      .map((node) => node.attributes('data-tab'))
    expect(tabLabels).toEqual(
      expect.arrayContaining([
        'Run Metrics',
        'Content',
        'Upload',
        'Growth',
        'System',
        'Overview',
        'Spider Detail',
        'Quality',
        'Coverage',
        'qBittorrent',
        'PikPak',
        'Infrastructure',
        'Operations',
      ]),
    )

    expect(wrapper.findComponent({ name: 'RunsOverviewTab' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'SpiderDetailTab' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ContentQualityTab' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ContentCoverageTab' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'UploadQbTab' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'UploadPikpakTab' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'SystemInfraTab' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'SystemOpsTab' }).exists()).toBe(true)
  })
})
