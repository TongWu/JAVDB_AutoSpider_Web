import { describe, expect, it } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import { isNetworkError } from '@/api/client'

describe('isNetworkError', () => {
  it('is true for a response-less Axios error (offline / DNS / CORS)', () => {
    expect(isNetworkError(new AxiosError('Network Error', AxiosError.ERR_NETWORK))).toBe(true)
  })

  it('is true for a client-side timeout (no response received)', () => {
    expect(isNetworkError(new AxiosError('timeout exceeded', AxiosError.ECONNABORTED))).toBe(true)
  })

  it('is false for an Axios error that carries an HTTP response', () => {
    const response = {
      status: 500,
      statusText: 'Internal Server Error',
      data: {},
      headers: {},
    } as unknown as AxiosResponse
    const err = new AxiosError(
      'Request failed',
      AxiosError.ERR_BAD_RESPONSE,
      undefined,
      undefined,
      response,
    )
    expect(isNetworkError(err)).toBe(false)
  })

  it('is false for non-Axios values', () => {
    expect(isNetworkError(new Error('boom'))).toBe(false)
    expect(isNetworkError('nope')).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})
