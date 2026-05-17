import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { useLocaleStore } from './stores/i18n'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

// Restore persisted locale before mount
const locale = useLocaleStore()
void locale.change(locale.current).finally(() => {
  app.mount('#app')
})
