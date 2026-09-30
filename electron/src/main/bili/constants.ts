/** Constants transcribed from the Python implementation (main.py). */

export const GITHUB_REPO = 'yyhhkya/bili_barrage'

/** Mobile app credentials. Public values shipped in every Bilibili client build. */
export const APPKEY = '4409e2ce8ffd12b8'
export const APPSECRET = '59b43e04ad6965f34319062b478f83dd'

export const UA = {
  /** Used for app-key signed calls (account/mine, danmaku, like). */
  biliDroid:
    'Mozilla/5.0 BiliDroid/6.73.1 (bbcallen@gmail.com) os/android model/Mi 10 Pro mobi_app/android build/6731100 channel/xiaomi innerVer/6731110 osVer/12 network/2',
  /** Used for web endpoints and QR login. */
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  /** Only get_room_up_id uses this shorter UA. */
  short: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
} as const

export const ENDPOINTS = {
  /** Account info + uid. Also the only source of the Set-Cookie used by watch. */
  accountMine: 'https://app.bilibili.com/x/v2/account/mine',
  roomInfo: 'https://api.live.bilibili.com/room/v1/Room/get_info',
  roomEntryAction: 'https://api.live.bilibili.com/room/v1/Room/room_entry_action',
  danmuInfoWeb: 'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo',
  danmuInfoApp: 'https://api.live.bilibili.com/xlive/app-room/v1/index/getDanmuInfo',
  emoticons: 'https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons',
  sendMsg: 'https://api.live.bilibili.com/xlive/app-room/v1/dM/sendmsg',
  likeReport: 'https://api.live.bilibili.com/xlive/app-ucenter/v1/like_info_v3/like/likeReportV3',
  webHeartbeat: 'https://live-trace.bilibili.com/xlive/rdata-interface/v1/heartbeat/webHeartBeat',
  qrcodeAuth: 'http://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code',
  qrcodePoll: 'http://passport.bilibili.com/x/passport-tv-login/qrcode/poll'
} as const

/** Cadences, in milliseconds. */
export const TIMING = {
  /** WebSocket op-2 heartbeat. */
  wsHeartbeat: 30_000,
  /** HTTP webHeartBeat cadence; also encoded as the "60" in the hb payload. */
  watchHeartbeat: 60_000,
  /** Gap between accounts when sending danmaku sequentially. */
  sequentialDanmakuGap: 500,
  /** Default per-request timeout. */
  requestTimeout: 10_000
} as const
