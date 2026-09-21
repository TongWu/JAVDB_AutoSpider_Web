import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { NConfigProvider } from 'naive-ui'
import { defineComponent } from 'vue'
import { useAuthStore } from '@/stores/auth'
import en from '@/i18n/locales/en.json'
import ConfigSnapshots from '@/components/settings/ConfigSnapshots.vue'

vi.mock('@/api/config', () => ({
  apiGetConfigConsumers: async () => ({schema_version:1, consumers:[{consumer:'api_process',status:'observed',reason:null,digest:'redacted-digest',snapshot:{scope:'resolver_at_start',captured_at:'2026-09-22T00:00:00.000Z',fields:[{key:'PAGE_END',source:'override_store',sensitive:false,present:true,value:7}]}}]}),
  apiGetJobConfigSnapshots: async () => ({schema_version:1,job_id:'job-a',consumers:[{consumer:'launched_job',status:'snapshot_unavailable',reason:'no_retained_evidence',snapshot:null,digest:null}]}),
}))

function render(role: 'admin' | 'readonly') {
  const pinia = createPinia()
  useAuthStore(pinia).role = role
  const i18n = createI18n({legacy:false,locale:'en',messages:{en}})
  return mount(defineComponent({components:{NConfigProvider,ConfigSnapshots},template:'<NConfigProvider><ConfigSnapshots /></NConfigProvider>'}), {global:{plugins:[pinia,i18n]}})
}

describe('consumer snapshot evidence', () => {
  it('shows live sources and unavailable historical evidence without inventing capture', async () => {
    const wrapper = render('admin')
    await flushPromises()
    expect(wrapper.text()).toContain('PAGE_END')
    expect(wrapper.text()).toContain('override_store')
    expect(() => new RegExp(wrapper.get('input').attributes('pattern')!, 'v')).not.toThrow()
    await wrapper.get('input').setValue('not valid')
    expect((wrapper.get('input').element as HTMLInputElement).checkValidity()).toBe(false)
    await wrapper.get('input').setValue('job-a')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('snapshot_unavailable')
    expect(wrapper.text()).toContain('no_retained_evidence')
    expect(wrapper.text()).toContain('not prove secret equality')
    wrapper.unmount()
  })
  it('does not expose the admin panel to a readonly user', async () => {
    const wrapper = render('readonly')
    await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('PAGE_END')
    wrapper.unmount()
  })
})
