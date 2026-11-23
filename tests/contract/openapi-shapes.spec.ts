import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEMA_PATH = resolve(__dirname, '../../tmp/openapi.json')

interface Operation {
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>
}
interface PathItem {
  get?: Operation
  post?: Operation
  put?: Operation
}
interface OpenAPISchema {
  paths: Record<string, PathItem>
  components: {
    schemas: Record<string, {
      properties?: Record<string, unknown>
      required?: string[]
    }>
  }
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')) as OpenAPISchema

const FE_CONSUMED: Array<[keyof PathItem, string]> = [
  ['post', '/api/auth/login'],
  ['post', '/api/auth/refresh'],
  ['post', '/api/auth/logout'],
  ['get', '/api/capabilities'],
  ['get', '/api/health'],
  ['get', '/api/config/consumers'],
  ['get', '/api/config/job-snapshots/{job_id}'],
  // ADR-024 Phase 2 torrent quality review surface (read + assist).
  ['get', '/api/quality/evaluations'],
  ['get', '/api/quality/evidence/{info_hash}'],
  ['get', '/api/quality/recommendations'],
  ['post', '/api/quality/review-labels'],
]

describe('OpenAPI contract — FE-consumed endpoints', () => {
  for (const [method, path] of FE_CONSUMED) {
    it(`${method.toUpperCase()} ${path} exists with a 200 JSON response`, () => {
      const item = schema.paths[path]
      expect(item, `path ${path} not found`).toBeTruthy()
      const op = item[method]
      expect(op, `${method} on ${path} not found`).toBeTruthy()
      const resp200 = op?.responses?.['200']
      expect(resp200, `200 response missing on ${method} ${path}`).toBeTruthy()
      const content = resp200?.content?.['application/json']
      expect(content?.schema, `application/json schema missing on ${method} ${path}`).toBeTruthy()
    })
  }
})

describe('OpenAPI contract — session commit failure', () => {
  it('declares the canonical top-level commit.failed 500 envelope', () => {
    const operation = schema.paths['/api/sessions/{session_id}/commit']?.post
    const response = operation?.responses?.['500']
    const responseSchema = response?.content?.['application/json']?.schema

    expect(responseSchema).toEqual({
      $ref: '#/components/schemas/SessionCommitFailedResponse',
    })

    const envelope = schema.components.schemas.SessionCommitFailedResponse
    expect(envelope.required).toContain('error')
    expect(envelope.properties?.error).toEqual({
      $ref: '#/components/schemas/SessionCommitFailureDetail',
    })

    const detail = schema.components.schemas.SessionCommitFailureDetail
    expect(detail.required).toEqual(expect.arrayContaining(['code', 'message']))
    expect(detail.properties?.code).toMatchObject({
      const: 'commit.failed',
      type: 'string',
    })
    expect(detail.properties?.message).toMatchObject({ type: 'string' })
  })
})
