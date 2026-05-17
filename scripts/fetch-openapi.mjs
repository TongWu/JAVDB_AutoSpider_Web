#!/usr/bin/env node
/**
 * fetch-openapi.mjs
 *
 * Downloads openapi.json from the main repo (or $OPENAPI_URL override),
 * writes it to tmp/openapi.json, then runs openapi-typescript to generate
 * src/types/api.gen.ts.
 *
 * Usage: node scripts/fetch-openapi.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TMP_DIR = path.join(ROOT, 'tmp')
const OUT_JSON = path.join(TMP_DIR, 'openapi.json')
const OUT_TS = path.join(ROOT, 'src', 'types', 'api.gen.ts')

const OPENAPI_URL =
  process.env['OPENAPI_URL'] ??
  'https://raw.githubusercontent.com/TongWu/JAVDB_AutoSpider_CICD/main/docs/api/openapi.json'

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

async function main() {
  await mkdir(TMP_DIR, { recursive: true })
  await mkdir(path.dirname(OUT_TS), { recursive: true })

  console.log(`Fetching ${OPENAPI_URL} ...`)
  const json = await fetchJson(OPENAPI_URL)
  await writeFile(OUT_JSON, json, 'utf-8')
  console.log(`Wrote ${OUT_JSON}`)

  console.log(`Running openapi-typescript ...`)
  execSync(
    `node node_modules/.bin/openapi-typescript ${OUT_JSON} -o ${OUT_TS}`,
    { cwd: ROOT, stdio: 'inherit' },
  )
  console.log(`Generated ${OUT_TS}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
