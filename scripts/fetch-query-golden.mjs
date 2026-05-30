#!/usr/bin/env node
/**
 * fetch-query-golden.mjs
 *
 * Resolves the dual-backend query Contract Golden from the main repo (local
 * file or remote URL) and writes the vendored copy under
 * server/__tests__/fixtures/. Mirrors fetch-openapi.mjs (ADR-018 D4/D6).
 *
 * Usage:
 *   # Dev (local main repo present):
 *   QUERY_GOLDEN_PATH=/path/to/docs/api/contract/query-builders.golden.json node scripts/fetch-query-golden.mjs
 *
 *   # CI (fetch from GitHub raw URL):
 *   node scripts/fetch-query-golden.mjs
 *   QUERY_GOLDEN_URL=https://... node scripts/fetch-query-golden.mjs
 *
 *   # Private repo (sends Authorization: Bearer <token>):
 *   QUERY_GOLDEN_TOKEN=ghp_xxx node scripts/fetch-query-golden.mjs
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'server', '__tests__', 'fixtures', 'query-builders.golden.json')

const SRC_PATH = process.env['QUERY_GOLDEN_PATH'] ?? ''
const SRC_URL =
  process.env['QUERY_GOLDEN_URL'] ??
  'https://raw.githubusercontent.com/TongWu/JAVDB_AutoSpider_CICD/main/docs/api/contract/query-builders.golden.json'
const TOKEN =
  process.env['QUERY_GOLDEN_TOKEN'] ??
  process.env['OPENAPI_TOKEN'] ??
  process.env['GITHUB_TOKEN'] ??
  ''

async function resolveGolden() {
  if (SRC_PATH) {
    console.log(`[fetch-query-golden] reading local: ${SRC_PATH}`)
    const data = await readFile(SRC_PATH, 'utf-8')
    JSON.parse(data) // validate
    return data
  }
  console.log(`[fetch-query-golden] fetching: ${SRC_URL}`)
  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
  const res = await fetch(SRC_URL, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${SRC_URL}`)
  const text = await res.text()
  JSON.parse(text) // validate
  return text
}

async function main() {
  const json = await resolveGolden()
  await mkdir(path.dirname(OUT), { recursive: true })
  await writeFile(OUT, json, 'utf-8')
  console.log(`[fetch-query-golden] wrote ${OUT}`)
}

main().catch((err) => {
  console.error('[fetch-query-golden] failed:', err)
  process.exit(1)
})
