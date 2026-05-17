import { describe, expect, it, vi } from 'vitest'

const postSpy = vi.fn()

vi.mock('@/api/client', () => ({
  http: { post: (...args: unknown[]) => postSpy(...args) },
}))

import { apiChangePassword } from '@/api/auth'

describe('apiChangePassword wrapper', () => {
  it('posts current_password and new_password to /api/auth/change-password', async () => {
    postSpy.mockResolvedValueOnce({ data: { status: 'ok' } })
    const res = await apiChangePassword('old-pw', 'new-password-1234')
    expect(postSpy).toHaveBeenCalledTimes(1)
    expect(postSpy).toHaveBeenCalledWith('/api/auth/change-password', {
      current_password: 'old-pw',
      new_password: 'new-password-1234',
    })
    expect(res).toEqual({ status: 'ok' })
  })

  it('propagates errors from the http client', async () => {
    postSpy.mockRejectedValueOnce(new Error('boom'))
    await expect(apiChangePassword('a', 'bcdefghij')).rejects.toThrow('boom')
  })
})
