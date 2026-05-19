#!/usr/bin/env node
/**
 * fetch-openapi.mjs
 *
 * Resolves openapi.json from the main repo (local file or remote URL),
 * writes it to tmp/openapi.json, then runs openapi-typescript to generate
 * src/types/api.gen.ts.
 *
 * Usage:
 *   # Dev (local main repo present):
 *   OPENAPI_PATH=/path/to/docs/api/openapi.json node scripts/fetch-openapi.mjs
 *
 *   # CI (fetch from GitHub raw URL):
 *   node scripts/fetch-openapi.mjs
 *   OPENAPI_URL=https://... node scripts/fetch-openapi.mjs
 *
 *   # Private repo (sends Authorization: Bearer <token>):
 *   OPENAPI_TOKEN=ghp_xxx node scripts/fetch-openapi.mjs
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TMP_DIR = path.join(ROOT, 'tmp')
const OUT_JSON = path.join(TMP_DIR, 'openapi.json')
const OUT_TS = path.join(ROOT, 'src', 'types', 'api.gen.ts')

const OPENAPI_PATH = process.env['OPENAPI_PATH'] ?? ''
const OPENAPI_URL =
  process.env['OPENAPI_URL'] ??
  'https://raw.githubusercontent.com/TongWu/JAVDB_AutoSpider_CICD/main/docs/api/openapi.json'
const OPENAPI_TOKEN =
  process.env['OPENAPI_TOKEN'] ?? process.env['GITHUB_TOKEN'] ?? ''

async function resolveSchema() {
  if (OPENAPI_PATH) {
    console.log(`[fetch-openapi] reading local: ${OPENAPI_PATH}`)
    const data = await readFile(OPENAPI_PATH, 'utf-8')
    // Validate JSON
    JSON.parse(data)
    return data
  }
  console.log(`[fetch-openapi] fetching: ${OPENAPI_URL}`)
  const headers = OPENAPI_TOKEN
    ? { Authorization: `Bearer ${OPENAPI_TOKEN}` }
    : {}
  const res = await fetch(OPENAPI_URL, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${OPENAPI_URL}`)
  const text = await res.text()
  // Validate JSON
  JSON.parse(text)
  return text
}

async function main() {
  await mkdir(TMP_DIR, { recursive: true })
  await mkdir(path.dirname(OUT_TS), { recursive: true })

  const json = await resolveSchema()
  await writeFile(OUT_JSON, json, 'utf-8')
  console.log(`[fetch-openapi] wrote ${OUT_JSON}`)

  console.log(`[fetch-openapi] running openapi-typescript ...`)
  execSync(
    `node node_modules/.bin/openapi-typescript ${OUT_JSON} -o ${OUT_TS}`,
    { cwd: ROOT, stdio: 'inherit' },
  )
  console.log(`[fetch-openapi] generated ${OUT_TS}`)
  console.log('[fetch-openapi] done.')
}

main().catch((err) => {
  console.error('[fetch-openapi] failed:', err)
  process.exit(1)
})
