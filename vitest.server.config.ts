import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        d1Databases: {
          HISTORY_DB: "history-test",
          REPORTS_DB: "reports-test",
          OPERATIONS_DB: "operations-test",
        },
        bindings: {
          API_SECRET_KEY: "test-secret-key-at-least-32-chars-long",
          ADMIN_USERNAME: "admin",
          ADMIN_PASSWORD_HASH: "plain:testpassword123",
          ENVIRONMENT: "test",
          GH_ACTIONS_TIER: "admin",
          GH_ACTIONS_REPO: "test-owner/test-repo",
          AUTH_KV: "auth-kv-test",
        },
        kvNamespaces: {
          AUTH_KV: "auth-kv-test",
        },
      },
    }),
  ],
  test: {
    include: ["server/__tests__/**/*.test.ts"],
    setupFiles: ["server/__tests__/setup.ts"],
  },
});
