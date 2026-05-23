import { describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import worker from "../worker";
import type { Env } from "../env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock ASSETS Fetcher that serves files from an in-memory map.
 * Paths not present in the map return a 404 response.
 */
function createMockAssets(
  files: Record<string, { body: string; contentType?: string }>
): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      const url =
        input instanceof URL
          ? input
          : typeof input === "string"
            ? new URL(input)
            : new URL(input.url);

      const entry = files[url.pathname];
      if (entry) {
        return new Response(entry.body, {
          status: 200,
          headers: { "Content-Type": entry.contentType ?? "text/html" },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
    // Satisfy the Fetcher interface — connect() is unused by worker.ts
    connect: (() => {
      throw new Error("connect not implemented");
    }) as unknown as Fetcher["connect"],
  } as Fetcher;
}

/** Merge the real test env (D1, bindings) with a mock ASSETS binding. */
function testEnv(assets: Fetcher): Env {
  return { ...env, ASSETS: assets } as unknown as Env;
}

const noopCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

/** Shortcut to build a Request aimed at the worker. */
function req(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

// ---------------------------------------------------------------------------
// Default mock assets used by most tests
// ---------------------------------------------------------------------------

const DEFAULT_FILES: Record<string, { body: string; contentType?: string }> = {
  "/index.html": { body: "<html><body>SPA</body></html>", contentType: "text/html" },
  "/assets/style.css": { body: "body{margin:0}", contentType: "text/css" },
  "/favicon.ico": { body: "icon-data", contentType: "image/x-icon" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Worker entry point", () => {
  // -----------------------------------------------------------------------
  // 1. API routes pass through to Hono
  // -----------------------------------------------------------------------
  describe("API routing (/api/*)", () => {
    it("GET /api/health returns { status: 'ok' } via Hono", async () => {
      const assets = createMockAssets(DEFAULT_FILES);
      const res = await worker.fetch(req("/api/health"), testEnv(assets), noopCtx);

      expect(res.status).toBe(200);
      const data = (await res.json()) as { status: string };
      expect(data.status).toBe("ok");
    });

    it("POST /api/auth/login with valid credentials returns 200 via Hono", async () => {
      const assets = createMockAssets(DEFAULT_FILES);
      const res = await worker.fetch(
        req("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "admin", password: "testpassword123" }),
        }),
        testEnv(assets),
        noopCtx,
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { access_token: string; token_type: string };
      expect(data.access_token).toBeDefined();
      expect(data.token_type).toBe("bearer");
    });

    it("GET /api/nonexistent is handled by Hono, not ASSETS", async () => {
      const assetsFetch = vi.fn();
      const assets = { fetch: assetsFetch, connect: () => {} } as unknown as Fetcher;

      const res = await worker.fetch(req("/api/nonexistent"), testEnv(assets), noopCtx);

      // Hono's auth middleware returns 401 for unauthenticated requests to
      // protected /api/* routes — the key assertion is that ASSETS is never
      // consulted for API paths.
      expect(res.status).toBe(401);
      expect(assetsFetch).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Static assets served from ASSETS binding
  // -----------------------------------------------------------------------
  describe("Static asset serving", () => {
    it("GET /assets/style.css returns the CSS file from ASSETS", async () => {
      const assets = createMockAssets(DEFAULT_FILES);
      const res = await worker.fetch(req("/assets/style.css"), testEnv(assets), noopCtx);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("body{margin:0}");
      expect(res.headers.get("Content-Type")).toBe("text/css");
    });

    it("GET /favicon.ico returns the icon from ASSETS", async () => {
      const assets = createMockAssets(DEFAULT_FILES);
      const res = await worker.fetch(req("/favicon.ico"), testEnv(assets), noopCtx);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("icon-data");
    });
  });

  // -----------------------------------------------------------------------
  // 3. SPA fallback — unknown non-API paths fall back to /index.html
  // -----------------------------------------------------------------------
  describe("SPA fallback", () => {
    it("GET /dashboard falls back to /index.html", async () => {
      const assets = createMockAssets(DEFAULT_FILES);
      const res = await worker.fetch(req("/dashboard"), testEnv(assets), noopCtx);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("<html><body>SPA</body></html>");
    });

    it("GET /settings/profile (nested path) falls back to /index.html", async () => {
      const assets = createMockAssets(DEFAULT_FILES);
      const res = await worker.fetch(req("/settings/profile"), testEnv(assets), noopCtx);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("<html><body>SPA</body></html>");
    });

    it("SPA fallback calls ASSETS.fetch with /index.html URL", async () => {
      const fetchSpy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();
      // First call (the original path) → 404, second call (/index.html) → 200
      fetchSpy
        .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
        .mockResolvedValueOnce(new Response("<html>SPA</html>", { status: 200 }));

      const assets = { fetch: fetchSpy, connect: () => {} } as unknown as Fetcher;
      const res = await worker.fetch(req("/unknown-route"), testEnv(assets), noopCtx);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("<html>SPA</html>");

      // Verify fetch was called twice
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Second call should be for /index.html
      const secondArg = fetchSpy.mock.calls[1][0];
      const fallbackUrl =
        secondArg instanceof URL
          ? secondArg
          : secondArg instanceof Request
            ? new URL(secondArg.url)
            : new URL(secondArg as string);
      expect(fallbackUrl.pathname).toBe("/index.html");
    });
  });

  // -----------------------------------------------------------------------
  // 4. Edge cases
  // -----------------------------------------------------------------------
  describe("Edge cases", () => {
    it("non-API asset that returns 200 is returned directly (no fallback)", async () => {
      const fetchSpy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();
      fetchSpy.mockResolvedValueOnce(
        new Response("real-asset", { status: 200, headers: { "Content-Type": "text/plain" } })
      );

      const assets = { fetch: fetchSpy, connect: () => {} } as unknown as Fetcher;
      const res = await worker.fetch(req("/robots.txt"), testEnv(assets), noopCtx);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("real-asset");
      // Should only be called once — no fallback needed
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("non-API asset returning 301 redirect is returned directly (not 404)", async () => {
      const fetchSpy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();
      fetchSpy.mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { Location: "/new-location" } })
      );

      const assets = { fetch: fetchSpy, connect: () => {} } as unknown as Fetcher;
      const res = await worker.fetch(req("/old-path"), testEnv(assets), noopCtx);

      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe("/new-location");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
