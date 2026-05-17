import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Bind to 127.0.0.1 (not localhost) so the dev server and the BE
    // (which defaults to 127.0.0.1:8100) share the same hostname.
    // Required for SameSite=Lax csrf cookies to flow on cross-port
    // PUT/POST/DELETE requests during dev. Accessing the FE as
    // http://localhost:5173 is a different site from http://127.0.0.1:8100
    // — the csrf cookie wouldn't be sent and BE would 403 every mutation.
    host: '127.0.0.1',
    port: 5173,
  },
})
