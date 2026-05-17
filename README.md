# JAVDB AutoSpider Web

Vue 3 + TypeScript frontend for the JAVDB AutoSpider automation system. Provides a dashboard UI for monitoring scraping runs, managing qBittorrent/PikPak transfers, browsing results, and configuring the pipeline.

**Design spec:** [2026-05-16-frontend-rewrite-design.md](https://github.com/TongWu/JAVDB_AutoSpider_CICD/blob/main/docs/superpowers/specs/2026-05-16-frontend-rewrite-design.md)

## Quick Start

```bash
git clone https://github.com/TongWu/javdb-autospider-web.git
cd javdb-autospider-web
npm install
cp .env.local.example .env.local   # set VITE_API_BASE_URL
npm run dev
```

The dev server starts at <http://localhost:5173>.

## Build

```bash
npm run build    # type-check + vite build → dist/
npm run preview  # preview production build locally
```

## Lint & Test

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:contract
```

## More Docs

Full deployment guides and task breakdown are in [docs/plans/2026-05-17-frontend-bootstrap.md](docs/plans/2026-05-17-frontend-bootstrap.md). Pages (Onboarding, Run, Tasks, Sessions, Browse, Settings) land in Plan C/D/E.
