import { Hono } from "hono";
import type { Env } from "../env";
import type { JwtPayload } from "../services/jwt";

type StubEnv = { Bindings: Env; Variables: { user: JwtPayload } };

export const stubRoutes = new Hono<StubEnv>();

function stub501(feature: string) {
  return {
    error: {
      code: "not_available",
      message: `${feature} is not available in Cloudflare mode`,
    },
  };
}

// ---------------------------------------------------------------------------
// Python-only endpoints — return 501 so the frontend gets a clear signal
// instead of a generic 404 when running against the Cloudflare backend.
// ---------------------------------------------------------------------------

// Crawl / scraping
stubRoutes.post("/crawl/index", (c) =>
  c.json(stub501("Crawl index"), 501),
);

// Page detection
stubRoutes.post("/detect-page-type", (c) =>
  c.json(stub501("Page type detection"), 501),
);

// Health check (Python-side, not /api/health)
stubRoutes.post("/health-check", (c) =>
  c.json(stub501("Health check"), 501),
);

// Login refresh
stubRoutes.post("/login/refresh", (c) =>
  c.json(stub501("Login refresh"), 501),
);

// Log search
stubRoutes.get("/logs/search", (c) =>
  c.json(stub501("Log search"), 501),
);

// Parse endpoints
stubRoutes.post("/parse/category", (c) =>
  c.json(stub501("Parse category"), 501),
);

stubRoutes.post("/parse/detail", (c) =>
  c.json(stub501("Parse detail"), 501),
);

stubRoutes.post("/parse/index", (c) =>
  c.json(stub501("Parse index"), 501),
);

stubRoutes.post("/parse/tags", (c) =>
  c.json(stub501("Parse tags"), 501),
);

stubRoutes.post("/parse/top", (c) =>
  c.json(stub501("Parse top"), 501),
);

stubRoutes.post("/parse/url", (c) =>
  c.json(stub501("Parse URL"), 501),
);

// Job management
stubRoutes.post("/jobs/spider", (c) =>
  c.json(stub501("Spider job"), 501),
);

stubRoutes.get("/jobs/:job_id/status", (c) =>
  c.json(stub501("Job status"), 501),
);

// Migrations
stubRoutes.get("/migrations/", (c) =>
  c.json(stub501("Migrations list"), 501),
);

stubRoutes.post("/migrations/:id/run", (c) =>
  c.json(stub501("Migration run"), 501),
);
