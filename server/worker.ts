import { app } from "./app";
import type { Env } from "./env";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }

    // Non-API routes: try static asset, fall back to index.html (SPA)
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      return asset;
    }
    return env.ASSETS.fetch(new URL("/index.html", request.url));
  },
};
