import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en.json'
import ProxyPoolEditor, { type ProxyEntry } from '@/components/ProxyPoolEditor.vue'

// Stub useDialog to avoid requiring NDialogProvider in test mount
vi.mock('naive-ui', async () => {
  const actual = await vi.importActual<typeof import('naive-ui')>('naive-ui')
  return {
    ...actual,
    useDialog: () => ({
      warning: vi.fn(),
    }),
  }
})

const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })

describe('ProxyPoolEditor', () => {
  it('renders empty state when modelValue is empty', () => {
    const wrapper = mount(ProxyPoolEditor, {
      props: { modelValue: [] as ProxyEntry[] },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('No proxies configured')
  })

  it('renders rows for each entry', () => {
    const wrapper = mount(ProxyPoolEditor, {
      props: {
        modelValue: [
          { name: 'home', http: 'http://127.0.0.1:7890', https: 'http://127.0.0.1:7890' },
          { name: 'office', http: 'http://10.0.0.1:8888', https: 'http://10.0.0.1:8888' },
        ],
      },
      global: { plugins: [i18n] },
    })
    expect(wrapper.findAll('.row').length).toBe(2)
  })

  it('emits update:modelValue when add is clicked', async () => {
    const wrapper = mount(ProxyPoolEditor, {
      props: { modelValue: [] as ProxyEntry[] },
      global: { plugins: [i18n] },
    })
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('Add proxy'))
    expect(addBtn).toBeDefined()
    await addBtn!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as ProxyEntry[]
    expect(last).toHaveLength(1)
    expect(last[0]).toEqual({ name: '', http: '', https: '' })
  })
})
