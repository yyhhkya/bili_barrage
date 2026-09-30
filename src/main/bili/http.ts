import { TIMING } from './constants'

export interface BiliResponse<T = unknown> {
  status: number
  body: T
  headers: Headers
}

type Params = Record<string, string | number | undefined | null>

export interface RequestOptions {
  params?: Params
  headers?: Record<string, string>
  timeout?: number
  /** Form-encoded body for POSTs. Mutually exclusive with `params`. */
  form?: Params
}

/**
 * `requests` skips None-valued params; mirror that so callers can pass
 * conditionally populated objects.
 */
function toSearchParams(params: Params): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    sp.append(k, String(v))
  }
  return sp
}

async function request<T>(
  method: 'GET' | 'POST',
  url: string,
  opts: RequestOptions = {}
): Promise<BiliResponse<T>> {
  const { params, headers = {}, timeout = TIMING.requestTimeout, form } = opts

  let target = url
  if (params) {
    const qs = toSearchParams(params).toString()
    if (qs) target += (url.includes('?') ? '&' : '?') + qs
  }

  const init: RequestInit = {
    method,
    headers: { ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow'
  }

  if (method === 'POST') {
    const body = toSearchParams(form ?? params ?? {}).toString()
    init.body = body
    // Form-encoded by default; a caller may still override it.
    if (!('Content-Type' in init.headers!)) {
      ;(init.headers as Record<string, string>)['Content-Type'] =
        'application/x-www-form-urlencoded'
    }
  }

  const res = await fetch(target, init)
  const text = await res.text()

  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    // Non-JSON body (HTML error page, empty 302 body, ...).
    // Callers that care about JSON decode failures check `typeof body === 'string'`.
  }

  return { status: res.status, body: parsed as T, headers: res.headers }
}

export function biliGet<T = unknown>(url: string, opts?: RequestOptions): Promise<BiliResponse<T>> {
  return request<T>('GET', url, opts)
}

export function biliPost<T = unknown>(url: string, opts?: RequestOptions): Promise<BiliResponse<T>> {
  return request<T>('POST', url, opts)
}

/** Fetches raw bytes. Used for emoticon images (never for JSON endpoints). */
export async function fetchBinary(url: string, timeout = 5000): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/** Shape of a standard Bilibili API envelope. */
export interface BiliEnvelope<T> {
  code: number
  message?: string
  msg?: string
  data?: T
}

/**
 * Bilibili spells the error field both ways across endpoints; `message` is the
 * common one but `msg` appears too, so a generic string is only used when
 * neither is present.
 */
export function errMessage(env: BiliEnvelope<unknown>): string {
  return env.message || env.msg || '未知错误'
}
