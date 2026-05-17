# Deploy: Split (FE on static host, BE on separate host)

Use this when you want the frontend on a CDN-backed static host (Cloudflare Pages, Vercel, GitHub Pages, Netlify, etc.) and the backend on a different server (VPS, EC2, Cloudflare Workers).

## When to choose this topology

- You want global edge distribution for the FE.
- You want to keep the BE on a private network / behind a VPN.
- You want to scale FE delivery and BE compute independently.

## Architecture

```
   User browser
       |
       |  HTTPS
       v
   Static FE host (Cloudflare Pages / Vercel / GH Pages)
       |
       |  HTTPS, with CORS allowed by the backend
       v
   Backend service (your VPS, with ghcr.io/.../javdb-autospider-api running)
```

`VITE_API_BASE_URL` is the FE's only configurable variable.

## Step 1: Deploy the backend

On your VPS / container host:

```bash
docker run -d \
  --name javdb-autospider-api \
  -p 8100:8100 \
  --env-file .env.api \
  -v javdb-api-reports:/app/reports \
  ghcr.io/TongWu/javdb-autospider-api:latest
```

Make sure the API is reachable from the public internet at `https://api.your-domain.com` (use a reverse proxy like Caddy or nginx for TLS termination).

Configure the backend's CORS allowlist to include your FE host:

```bash
# in .env.api
ALLOWED_ORIGINS=https://app.your-domain.com
```

## Step 2: Build the FE for your BE URL

```bash
git clone https://github.com/TongWu/JAVDB_AutoSpider_Web.git
cd JAVDB_AutoSpider_Web
npm install
VITE_API_BASE_URL=https://api.your-domain.com npm run build
```

The `dist/` directory is the static bundle.

## Step 3: Upload `dist/` to your host

### Cloudflare Pages

```bash
npm install -g wrangler
wrangler pages deploy dist --project-name=javdb-autospider-web
```

In the Pages project settings, add an environment variable `VITE_API_BASE_URL=https://api.your-domain.com`. Set up a custom domain.

### Vercel

```bash
npm install -g vercel
vercel deploy --prod dist
```

In project settings, set `VITE_API_BASE_URL` as a build-time env var so future deploys pick it up.

### GitHub Pages

Push `dist/` to a `gh-pages` branch (or use `peaceiris/actions-gh-pages` in CI). Note: GH Pages doesn't support custom HTTP headers — if your BE requires specific cookie SameSite settings, prefer Cloudflare Pages or Vercel.

### Generic static host

Upload `dist/` to any HTTP server. Configure SPA fallback (rewrite all 404s to `/index.html`).

## CORS gotchas

- Browser sends `Origin: https://app.your-domain.com`.
- BE must reply with `Access-Control-Allow-Origin: https://app.your-domain.com` (NOT `*`, because the FE sends credentials).
- BE must reply with `Access-Control-Allow-Credentials: true`.
- The CSRF cookie is set on the BE host; if the FE host is on a different eTLD+1 from the BE, set the cookie `SameSite=None; Secure` server-side.

The backend already handles all of this if `ALLOWED_ORIGINS` is set correctly.

## Updating the FE

Re-run the build and re-upload — no downtime since the static host serves the new bundle on the next request.
