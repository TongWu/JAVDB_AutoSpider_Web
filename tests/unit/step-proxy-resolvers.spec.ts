import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const componentSource = readFileSync(
  resolve(__dirname, '../../src/components/onboarding/StepProxy.vue'),
  'utf-8',
)

describe('StepProxy code shape', () => {
  it('contains resolvePool function reading from configSnapshot.PROXY_POOL', () => {
    expect(componentSource).toMatch(/function resolvePool/)
    expect(componentSource).toMatch(/configSnapshot\?\.PROXY_POOL/)
  })

  it('contains resolveModules with length check (not || on array)', () => {
    expect(componentSource).toMatch(/function resolveModules/)
    expect(componentSource).toMatch(/configSnapshot\?\.PROXY_MODULES/)
    // The buggy '|| fallback' pattern must NOT appear
    expect(componentSource).not.toMatch(/getStepValue.+'modules'.+\)\s*\|\|/)
  })

  it('contains watch on configSnapshot for late updates', () => {
    expect(componentSource).toMatch(/watch\(.*configSnapshot/)
  })
})
