import { createHash } from 'node:crypto'
import { APPSECRET } from './constants'

/**
 * Bilibili app-key signing.
 *
 * Bilibili signs by joining `k=v` over ASCII-sorted keys, appending the
 * appsecret with no separator, and MD5-ing the result. Values are interpolated
 * raw: no URL encoding is applied.
 *
 * Callers must compute the sign BEFORE inserting `sign` into the params object,
 * so `sign` is never part of the signed string.
 */
export function signParams(
  params: Record<string, string | number>,
  appsecret: string = APPSECRET
): string {
  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('md5').update(query + appsecret).digest('hex')
}

/** Same as {@link signParams} but returns a copy with `sign` appended. */
export function withSign(
  params: Record<string, string | number>,
  appsecret: string = APPSECRET
): Record<string, string | number> {
  return { ...params, sign: signParams(params, appsecret) }
}
