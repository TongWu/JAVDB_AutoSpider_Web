import type { paths } from '@/types/api.gen'

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export type PathFor<P extends keyof paths> = paths[P]

/** Resolve the 200 application/json response shape for a path + method. */
export type ResponseFor<P extends keyof paths, M extends HttpMethod> =
  paths[P] extends Record<M, infer Op>
    ? Op extends {
        responses: { 200: { content: { 'application/json': infer Body } } }
      }
      ? Body
      : never
    : never

/** Resolve the JSON request-body shape for a path + method. */
export type RequestBodyFor<P extends keyof paths, M extends HttpMethod> =
  paths[P] extends Record<M, infer Op>
    ? Op extends {
        requestBody?: { content: { 'application/json': infer Body } }
      }
      ? Body
      : never
    : never
