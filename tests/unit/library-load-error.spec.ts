import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import { loadErrorMessage } from '@/pages/library/loadError'

// Identity stub: returns whichever i18n key it was handed, so assertions can
// check which key loadErrorMessage selected without a full i18n instance.
const t = (key: string) => key

describe('loadErrorMessage', () => {
  it('returns the shared network-error key for a response-less Axios error', () => {
    const msg = loadErrorMessage(
      new AxiosError('Network Error', AxiosError.ERR_NETWORK),
      t,
      'library.watchlist.loadError',
    )
    expect(msg).toBe('common.networkError')
  })

  it('returns the caller-supplied fallback key for non-network errors', () => {
    const msg = loadErrorMessage(new Error('boom'), t, 'library.ownership.loadError')
    expect(msg).toBe('library.ownership.loadError')
  })
})
