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
  /**
   * The server's opaque id for the image (`emoticon_unique`), not display text.
   *
   * Sending this id as the danmaku body is what draws the image: the server
   * substitutes the emoticon only when the id is the entire message and the
   * request carries dm_type=1. Sending it with dm_type=0 posts the raw id as
   * literal text, which is the bug this field name used to invite.
   */
  unique: string
  url: string
  /** Human label. For the free system set this is the bracketed text, e.g. `[妙啊]`. */
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
  /**
   * The release tag exactly as GitHub reports it, `v` prefix or not.
   *
   * Tags in this repo are bare (`2.4.1`), but GitHub projects commonly use
   * `v2.4.1`, and nothing guarantees which. Download URLs are built from this
   * value rather than reconstructed from `latest_version`, because
   * reconstructing means guessing the prefix and guessing wrong gives a 404.
   */
  tag?: string
  url?: string
  body?: string
}

export interface UpdateProgress {
  percent: number
  status: 'idle' | 'downloading' | 'done' | 'error'
  message: string
}

/**
 * QR login poll result.
 * `pending` and `failed` are sentinels; anything else is an access key.
 * Every non-zero Bilibili code collapses to `pending`, including 86038
 * (expired) and 86090 (scanned, not yet confirmed), so the renderer cannot tell
 * "expired" from "still waiting".
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
  'window:state': WindowState
}
