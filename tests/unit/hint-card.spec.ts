import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en.json'
import HintCard from '@/components/HintCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en },
})

describe('HintCard', () => {
  it('renders title and body', () => {
    const wrapper = mount(HintCard, {
      props: { hintId: 'smtp', title: 'Foo', body: 'Bar bar' },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('Foo')
    expect(wrapper.text()).toContain('Bar bar')
  })

  it('emits dismiss with hintId when dismiss clicked', async () => {
    const wrapper = mount(HintCard, {
      props: { hintId: 'pikpak', title: 'T', body: 'B' },
      global: { plugins: [i18n] },
    })
    const dismissBtn = wrapper.findAll('button').find((b) => b.text().includes('Dismiss'))
    expect(dismissBtn).toBeDefined()
    await dismissBtn!.trigger('click')
    expect(wrapper.emitted('dismiss')).toEqual([['pikpak']])
  })
})
