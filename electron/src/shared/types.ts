/**
 * Types shared by main, preload and renderer.
 * No imports of `electron` here on purpose: the bili/ and core/ layers must
 * stay runnable without an Electron runtime.
 */

export interface Account {
  nickname: string
  key: string
}

export type TaskStatus = '停止' | '启动中' | '运行中' | '停止中'

export interface Task {
  id: number
  room_id: string
  room_remark: string
  content: string
  accounts: string[]
  account_keys: string[]
  interval: number
  status: TaskStatus
  current_content_index: number
  /** Only present on a running task; never persisted. */
  up_id?: string
}

export interface AppState {
  accounts: Account[]
  tasks: Task[]
  version: string
}

export interface WatchEntry {
  account: string
  room_id: string
}

/** Emoticon payload sent to the renderer. Images are inlined as data URLs. */
export interface EmoticonGroup {
  name: string
  cover: string
  emoticons: Emoticon[]
}

export interface Emoticon {
  emoji: string
  url: string
  descript: string
}

export interface LikeCountTotal {
  nickname: string
  key: string
  total: number
  rooms: Record<string, number>
}

export interface UpdateInfo {
  has_update: boolean
  current_version: string
  latest_version?: string
  url?: string
  body?: string
}

export interface UpdateProgress {
  percent: number
  status: 'idle' | 'downloading' | 'done' | 'error'
  message: string
}

export interface MirrorResult {
  name: string
  prefix: string
  latency: number
  status: 'pending' | 'testing' | 'ok' | 'error'
}

/**
 * QR login poll result.
 * `pending` and `failed` are sentinels; anything else is an access key.
 * Matches the Python behaviour: every non-zero Bilibili code collapses to
 * `pending`, including 86038 (expired) and 86090 (scanned, not confirmed).
 */
export type LoginPollResult = 'pending' | 'failed' | string

/** Result envelope for every invoke channel, so the renderer never sees a throw. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface WindowState {
  maximized: boolean
  fullscreen: boolean
}

export interface PushEvents {
  'state:changed': AppState
  'watch:changed': WatchEntry[]
  'log:line': string
  'update:progress': UpdateProgress
  'mirror:results': MirrorResult[]
  'window:state': WindowState
}
