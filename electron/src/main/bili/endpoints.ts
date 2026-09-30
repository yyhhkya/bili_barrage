import { biliGet, biliPost, type BiliEnvelope } from './http'
import { signParams, withSign } from './sign'
import { APPKEY, ENDPOINTS, UA } from './constants'
import { randomBuvid } from '../core/random'

/**
 * Naive Set-Cookie parsing: split on ';' and re-join every fragment that
 * contains '='. That folds attribute fragments (Path, Expires) into the cookie
 * string and truncates a value at its first '='. Sloppy, but Bilibili accepts
 * the resulting header, and a strict cookie jar would drop the attribute
 * fragments the presence heartbeat currently sends.
 */
function extractCookie(setCookie: string[]): string {
  if (!setCookie.length) return ''
  const combined = setCookie.join(', ')
  return combined
    .split(';')
    .filter((c) => c.includes('='))
    .map((c) => {
      const parts = c.split('=')
      return `${parts[0]}=${parts[1] ?? ''}`
    })
    .join('; ')
}

export interface NicknameAndUid {
  uid: number
  cookie: string
  name: string
}

/**
 * `app.bilibili.com/x/v2/account/mine`. Single call that yields uid, display
 * name and the Set-Cookie jar used by every watch-manager request.
 */
export async function fetchAccountMine(accessKey: string): Promise<NicknameAndUid | null> {
  const params = withSign({
    access_key: accessKey,
    actionKey: 'appkey',
    appkey: APPKEY,
    ts: Math.floor(Date.now() / 1000)
  })

  const res = await biliGet<BiliEnvelope<{ mid?: number; name?: string; uname?: string; nickname?: string }>>(
    ENDPOINTS.accountMine,
    { params, headers: { 'User-Agent': UA.biliDroid } }
  )

  if (res.status !== 200) return null
  const env = res.body
  const mid = env?.data?.mid
  if (env?.code !== 0 || !mid) return null

  const d = env.data!
  return {
    uid: mid,
    cookie: extractCookie(res.headers.getSetCookie()),
    name: d.name || d.uname || d.nickname || ''
  }
}

/** Nickname only. Uses the short UA, matching `_get_nickname`. */
export async function fetchNickname(accessKey: string): Promise<string | null> {
  const params = withSign({
    access_key: accessKey,
    actionKey: 'appkey',
    appkey: APPKEY,
    ts: Math.floor(Date.now() / 1000)
  })

  const res = await biliGet<BiliEnvelope<{ name?: string; uname?: string; nickname?: string }>>(
    ENDPOINTS.accountMine,
    { params, headers: { 'User-Agent': UA.short } }
  )

  if (res.status === 200 && res.body?.code === 0 && res.body.data) {
    const d = res.body.data
    const name = d.name || d.uname || d.nickname || ''
    if (name) return name
  }
  return null
}

/** `mid` for the given access key. Returns null on any failure. */
export async function fetchMyUid(accessKey: string): Promise<number | null> {
  const params = withSign({
    access_key: accessKey,
    actionKey: 'appkey',
    appkey: APPKEY,
    ts: Math.floor(Date.now() / 1000)
  })

  const res = await biliGet<BiliEnvelope<{ mid?: number }>>(ENDPOINTS.accountMine, {
    params,
    headers: { 'User-Agent': UA.biliDroid }
  })

  if (res.status === 200 && res.body?.code === 0 && res.body.data?.mid) {
    return res.body.data.mid
  }
  return null
}

export interface RoomInfo {
  uid: number
  roomId: number
}

export async function fetchRoomInfo(roomId: string): Promise<RoomInfo | null> {
  const res = await biliGet<BiliEnvelope<{ uid?: number; room_id?: number }>>(ENDPOINTS.roomInfo, {
    params: { room_id: roomId },
    headers: { 'User-Agent': UA.short }
  })

  if (res.body?.code === 0 && res.body.data?.uid) {
    return { uid: res.body.data.uid, roomId: res.body.data.room_id ?? Number(roomId) }
  }
  return null
}

export async function fetchRoomUpId(roomId: string): Promise<number | null> {
  const info = await fetchRoomInfo(roomId)
  return info ? info.uid : null
}

// ---------------------------------------------------------------- emoticons

export interface RawEmoticon {
  emoji: string
  url: string
  descript: string
}

export interface RawEmoticonGroup {
  name: string
  cover: string
  emoticons: RawEmoticon[]
}

/** Bilibili serves some emote assets over plain http; upgrade so the strict CSP
 * and mixed-content rules stay satisfied. */
function upgradeScheme(url: string): string {
  return url.startsWith('http:') ? `https:${url.slice(5)}` : url
}

export async function fetchEmoticons(accessKey: string, roomId = ''): Promise<RawEmoticonGroup[]> {
  const base: Record<string, string | number> = {
    access_key: accessKey,
    actionKey: 'appkey',
    appkey: APPKEY,
    build: '8950600',
    channel: 'bili',
    device: 'android',
    disable_rcmd: '0',
    mobi_app: 'android',
    platform: 'android',
    ts: Math.floor(Date.now() / 1000),
    version: '8.95.0'
  }
  if (roomId) base.room_id = roomId

  const res = await biliGet<
    BiliEnvelope<{ data?: Array<{ pkg_name?: string; current_cover?: string; emoticons?: Array<{ emoticon_unique?: string; emoji?: string; url?: string; descript?: string }> }> }>
  >(ENDPOINTS.emoticons, {
    params: withSign(base),
    headers: { 'User-Agent': UA.biliDroid }
  })

  if (res.body?.code !== 0) return []

  // NOTE: the payload nests a `data` array inside `data`. Preserved as-is.
  const inner = res.body.data?.data
  const packages = Array.isArray(inner) ? inner : []

  return packages.map((pkg) => ({
    name: pkg.pkg_name || '',
    cover: upgradeScheme(pkg.current_cover || ''),
    emoticons: (pkg.emoticons || []).map((em) => ({
      emoji: em.emoticon_unique || em.emoji || '',
      url: upgradeScheme(em.url || ''),
      descript: em.descript || em.emoji || ''
    }))
  }))
}

// --------------------------------------------------------------- QR login

export async function requestQrCode(): Promise<{ url: string; authCode: string }> {
  const data = withSign({
    local_id: '0',
    ts: String(Math.floor(Date.now() / 1000)),
    appkey: APPKEY
  })

  const res = await biliPost<BiliEnvelope<{ url: string; auth_code: string }>>(ENDPOINTS.qrcodeAuth, {
    form: data,
    headers: { 'User-Agent': UA.chrome }
  })

  if (res.body?.code === 0 && res.body.data) {
    return { url: res.body.data.url, authCode: res.body.data.auth_code }
  }
  throw new Error(
    `获取二维码失败: ${(res.body as BiliEnvelope<unknown>)?.message ?? '未知错误'}`
  )
}

/**
 * Returns an access key on success, otherwise `'pending'`.
 * Every non-zero Bilibili code collapses to `pending`, including 86038
 * (expired) and 86090 (scanned, not yet confirmed). An expired code therefore
 * polls forever rather than reporting expiry; the dialog cancel button is the
 * only escape. Telling them apart would mean handling the endpoint error codes
 * explicitly.
 */
export async function pollQrLogin(authCode: string): Promise<string> {
  const data = withSign({
    auth_code: authCode,
    local_id: '0',
    ts: String(Math.floor(Date.now() / 1000)),
    appkey: APPKEY
  })

  const res = await biliPost<BiliEnvelope<{ access_token?: string }>>(ENDPOINTS.qrcodePoll, {
    form: data,
    headers: { 'User-Agent': UA.chrome }
  })

  if (res.body?.code === 0 && res.body.data?.access_token) {
    return res.body.data.access_token
  }
  return 'pending'
}

// ---------------------------------------------------------------- danmaku

export interface SendDanmakuResult {
  ok: boolean
  message: string
}

/**
 * Send one danmaku as one account.
 *
 * Notable behaviour carried over deliberately:
 * - no csrf / buvid3 / nav bootstrap; a locally random 37-char buvid is sent
 *   as the `Buvid` header and nowhere else
 * - the message is NOT split to fit a length limit
 * - no retry
 */
export async function sendDanmaku(
  accessKey: string,
  roomId: string,
  content: string,
  dmType = 0
): Promise<SendDanmakuResult> {
  const ts = Math.floor(Date.now() / 1000)
  const mid = (await fetchMyUid(accessKey)) ?? 0
  const buvid = randomBuvid()

  const params: Record<string, string | number> = {
    access_key: accessKey,
    actionKey: 'appkey',
    appkey: APPKEY,
    av_id: '-99998',
    bubble: '0',
    build: '8950600',
    channel: 'bili',
    cid: roomId,
    color: '16777215',
    device: 'android',
    disable_rcmd: '0',
    fontsize: '25',
    jumpfrom: '99998',
    jumpfrom_extend: '-99998',
    launch_id: '-99998',
    live_status: 'prepare',
    mid: String(mid),
    mobi_app: 'android',
    mode: '1',
    msg: content,
    msg_type: '0',
    platform: 'android',
    playTime: '0.0',
    pool: '0',
    reply_attr: '0',
    reply_mid: '0',
    reply_type: '0',
    reply_uname: '',
    rnd: String(ts),
    room_type: '0',
    screen_status: '2',
    session_id: '-99998',
    ts: String(ts),
    type: 'json',
    version: '8.95.0',
    bussiness_extend: JSON.stringify({
      broadcast_type: '0',
      stream_scale: '-99998',
      watch_ui_type: '2'
    }),
    data_extend: JSON.stringify({
      from_launch_id: '-99998',
      from_session_id: '-99998',
      live_key: '-99998',
      sub_session_key: '-99998'
    }),
    flow_extend: JSON.stringify({ position: '1', s_position: '1', slide_direction: '-99998' }),
    live_statistics: JSON.stringify({
      buvid,
      session_id: '-99998',
      launch_id: '-99998',
      jumpfrom: '99998',
      jumpfrom_extend: '-99998',
      screen_status: '2',
      live_status: 'prepare',
      av_id: '-99998'
    }),
    statistics: JSON.stringify({ appId: 1, platform: 3, version: '8.95.0', abtest: '' })
  }

  if (dmType) params.dm_type = String(dmType)
  params.sign = signParams(params)

  const res = await biliPost<BiliEnvelope<unknown>>(ENDPOINTS.sendMsg, {
    form: params,
    headers: { 'User-Agent': UA.biliDroid, Buvid: buvid },
    timeout: 15_000
  })

  if (res.body?.code === 0) return { ok: true, message: '' }
  return { ok: false, message: `${(res.body as BiliEnvelope<unknown>)?.message ?? '未知错误'} (code=${(res.body as BiliEnvelope<unknown>)?.code})` }
}

// ------------------------------------------------------------------- like

export interface LikeResult {
  ok: boolean
  message: string
  /** True when the like was accepted; caller uses this to record the count. */
  counted: boolean
}

/**
 * One like report. `click_time` is the number of clicks to register.
 * Falls back to the anchor's uid when the caller's own uid cannot be resolved.
 */
export async function likeRoom(
  accessKey: string,
  roomId: string,
  clickTime: number
): Promise<LikeResult> {
  const anchorUid = await fetchRoomUpId(roomId)
  if (!anchorUid) {
    return { ok: false, message: `获取直播间 ${roomId} 主播信息失败，点赞取消`, counted: false }
  }

  const selfUid = (await fetchMyUid(accessKey)) ?? anchorUid
  const buvid = randomBuvid()

  const params: Record<string, string | number> = {
    access_key: accessKey,
    actionKey: 'appkey',
    anchor_id: anchorUid,
    appkey: APPKEY,
    click_time: clickTime,
    room_id: roomId,
    uid: selfUid
  }
  params.sign = signParams(params)

  const res = await biliPost<BiliEnvelope<unknown>>(ENDPOINTS.likeReport, {
    form: params,
    headers: { 'User-Agent': UA.biliDroid, Buvid: buvid, env: 'prod' },
    timeout: 15_000
  })

  if (res.body?.code === 0) return { ok: true, message: '', counted: true }
  return {
    ok: false,
    message: (res.body as BiliEnvelope<unknown>)?.message ?? '未知错误',
    counted: false
  }
}

// ------------------------------------------------------- watch (presence)

/** Enter the room once, so the presence is registered before heartbeating. */
export async function roomEntryAction(roomId: string, cookie: string): Promise<boolean> {
  const res = await biliPost<BiliEnvelope<unknown>>(ENDPOINTS.roomEntryAction, {
    form: { room_id: roomId, platform: 'pc' },
    headers: {
      'User-Agent': UA.chrome,
      Cookie: cookie,
      Referer: `https://live.bilibili.com/${roomId}`
    }
  })
  return res.body?.code === 0
}

export interface DanmuInfo {
  token: string
  host: string
  wssPort: number
}

function parseDanmuInfo(data: unknown): DanmuInfo | null {
  const d = data as { token?: string; host_list?: Array<{ host?: string; wss_port?: number }> } | undefined
  const host0 = d?.host_list?.[0]
  if (!d?.token || !host0?.host || !host0?.wss_port) return null
  return { token: d.token, host: host0.host, wssPort: host0.wss_port }
}

/** Web endpoint. Preferred; falls back to {@link fetchDanmuInfoApp}. */
export async function fetchDanmuInfoWeb(roomId: string, cookie: string): Promise<DanmuInfo | null> {
  const res = await biliGet<BiliEnvelope<unknown>>(ENDPOINTS.danmuInfoWeb, {
    params: { id: roomId, type: 0 },
    headers: { Cookie: cookie, 'User-Agent': UA.chrome }
  })

  if (res.body?.code === 0 && res.body.data) {
    const parsed = parseDanmuInfo(res.body.data)
    if (parsed) return parsed
  }
  return null
}

/** App-signed fallback, used when the web call yields nothing. */
export async function fetchDanmuInfoApp(roomId: string, accessKey: string): Promise<DanmuInfo | null> {
  const params = withSign({
    access_key: accessKey,
    actionKey: 'appkey',
    appkey: APPKEY,
    room_id: roomId,
    ts: Math.floor(Date.now() / 1000)
  })

  const res = await biliGet<BiliEnvelope<unknown>>(ENDPOINTS.danmuInfoApp, {
    params,
    headers: { 'User-Agent': UA.biliDroid }
  })

  if (res.body?.code === 0 && res.body.data) {
    return parseDanmuInfo(res.body.data)
  }
  return null
}

/**
 * HTTP presence heartbeat. Payload is base64 of `60|<roomId>|1|0`, where the
 * leading 60 matches the 60 s cadence.
 */
export async function webHeartbeat(roomId: string, cookie: string): Promise<boolean> {
  const hb = Buffer.from(`60|${roomId}|1|0`, 'utf-8').toString('base64')

  const res = await biliGet<BiliEnvelope<unknown>>(ENDPOINTS.webHeartbeat, {
    params: { hb, pf: 'web' },
    headers: {
      'User-Agent': UA.chrome,
      Cookie: cookie,
      Referer: `https://live.bilibili.com/${roomId}`
    }
  })

  return res.body?.code === 0
}
