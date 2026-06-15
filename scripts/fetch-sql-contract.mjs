#!/usr/bin/env node
/**
 * fetch-sql-contract.mjs
 *
 * Resolves the ADR-055 generated SQL contract module from the main repo (local
 * file or remote URL) and writes the vendored copy to server/contract/. Unlike
 * the query golden (a test fixture), this is PRODUCTION code the Worker imports.
 * Mirrors fetch-openapi.mjs / fetch-query-golden.mjs (ADR-018 D4/D6).
 *
 * Dev:  SQL_CONTRACT_PATH=/path/to/docs/api/contract/sql-contract.gen.ts node scripts/fetch-sql-contract.mjs
 * CI:   node scripts/fetch-sql-contract.mjs            (fetches GitHub raw URL)
 * Auth: SQL_CONTRACT_TOKEN=ghp_xxx node scripts/fetch-sql-contract.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'server', 'contract', 'sql-contract.gen.ts')

const SRC_PATH = process.env['SQL_CONTRACT_PATH'] ?? ''
const SRC_URL =
  process.env['SQL_CONTRACT_URL'] ??
  'https://raw.githubusercontent.com/TongWu/JAVDB_AutoSpider_CICD/main/docs/api/contract/sql-contract.gen.ts'
const TOKEN =
  process.env['SQL_CONTRACT_TOKEN'] ??
  process.env['OPENAPI_TOKEN'] ??
  process.env['GITHUB_TOKEN'] ??
  ''

function assertContract(text) {
  if (!text.includes('AUTO-GENERATED') || !text.includes('export const')) {
    throw new Error('sql-contract payload is not a generated TS module')
  }
}

async function resolveContract() {
  if (SRC_PATH) {
    console.log(`[fetch-sql-contract] reading local: ${SRC_PATH}`)
    const data = await readFile(SRC_PATH, 'utf-8')
    assertContract(data)
    return data
  }
  console.log(`[fetch-sql-contract] fetching: ${SRC_URL}`)
  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
  const res = await fetch(SRC_URL, { headers, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${SRC_URL}`)
  const text = await res.text()
  assertContract(text)
  return text
}

async function main() {
  const ts = await resolveContract()
  await mkdir(path.dirname(OUT), { recursive: true })
  await writeFile(OUT, ts, 'utf-8')
  console.log(`[fetch-sql-contract] wrote ${OUT}`)
}

main().catch((err) => {
  console.error('[fetch-sql-contract] failed:', err)
  process.exit(1)
})
