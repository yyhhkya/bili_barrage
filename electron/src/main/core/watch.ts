import { EventEmitter } from 'node:events'
import type { WatchEntry } from '../../shared/types'
import type { AppCore } from './app'
import {
  fetchAccountMine,
  fetchDanmuInfoApp,
  fetchDanmuInfoWeb,
  fetchRoomUpId,
  roomEntryAction,
  webHeartbeat,
  type DanmuInfo
} from '../bili/endpoints'
import { BiliLiveWS } from '../bili/ws'
import { TIMING } from '../bili/constants'
import { mapLimit } from './concurrency'

interface WatchSession {
  roomId: string
  accessKey: string
  nickname: string
  cookie: string
  ws: BiliLiveWS | null
  httpTimer: NodeJS.Timeout | null
}

/**
 * "挂榜" presence manager: enters a room and keeps it alive.
 *
 * Per room+account this maintains two independent cadences, same as the Python
 * original:
 * - WebSocket op-2 heartbeat, every 30 s (send-only socket)
 * - HTTP webHeartBeat, every 60 s, plus one immediately on start
 *
 * Difference from the Python version: sessions are keyed explicitly and every
 * timer handle is tracked, so `stopWatch` reliably cancels. The original stored
 * a `threading.Timer` inside a lock-free dict and could orphan a live timer.
 */
export class WatchManager extends EventEmitter {
  private readonly sessions = new Map<string, WatchSession>()

  constructor(private readonly app: AppCore) {
    super()
  }

  private key(accessKey: string, roomId: string): string {
    return `${accessKey}-${roomId}`
  }

  hasTask(accessKey: string, roomId: string): boolean {
    return this.sessions.has(this.key(accessKey, roomId))
  }

  getStatus(): WatchEntry[] {
    return [...this.sessions.values()].map((s) => ({
      account: s.nickname || '未知',
      room_id: s.roomId
    }))
  }

  private emitChanged(): void {
    this.emit('changed', this.getStatus())
  }

  /**
   * Resolve credentials, enter the room, open the socket, start heartbeating.
   * `upId` is accepted for call-site parity but unused, as upstream.
   */
  async startWatch(
    accessKey: string,
    roomId: string,
    _upId: number | null,
    nickname: string
  ): Promise<void> {
    const log = (m: string): void => this.app.logger.log(m)
    const key = this.key(accessKey, roomId)

    if (this.sessions.has(key)) {
      log(`[${nickname}] 直播间 ${roomId} 已有任务运行中`)
      return
    }

    log(`[${nickname}] 开始监听直播间 ${roomId}`)

    // 1. uid + cookie jar
    const account = await fetchAccountMine(accessKey).catch(() => null)
    if (!account) {
      log(`[${nickname}] 无法获取用户信息，任务终止`)
      return
    }

    // 2. register presence
    const entered = await roomEntryAction(roomId, account.cookie).catch(() => false)
    if (entered) {
      log(`[${nickname}] 成功进入直播间 ${roomId}`)
    } else {
      log(`[${nickname}] 进入直播间 ${roomId} 失败`)
    }

    // 3. danmu server token + host list; app endpoint is the fallback
    let danmuInfo: DanmuInfo | null = await fetchDanmuInfoWeb(roomId, account.cookie).catch(
      () => null
    )
    if (!danmuInfo) {
      danmuInfo = await fetchDanmuInfoApp(roomId, accessKey).catch(() => null)
    }

    const session: WatchSession = {
      roomId,
      accessKey,
      nickname,
      cookie: account.cookie,
      ws: null,
      httpTimer: null
    }

    if (danmuInfo) {
      session.ws = new BiliLiveWS(
        roomId,
        account.uid,
        danmuInfo.token,
        danmuInfo.host,
        danmuInfo.wssPort,
        log,
        nickname
      )
      session.ws.connect()
    } else {
      // Upstream logs this and carries on: the HTTP heartbeat alone still counts
      // as presence, so the session is registered either way.
      log(`[${nickname}] 获取WebSocket信息失败，无法建立长连接`)
    }

    this.sessions.set(key, session)
    this.emitChanged()

    // 4. immediate HTTP heartbeat, then every 60 s
    await this.heartbeat(session)
    session.httpTimer = setInterval(() => void this.heartbeat(session), TIMING.watchHeartbeat)

    log(`[${nickname}] 已开始进房任务 ${roomId}`)
  }

  private async heartbeat(session: WatchSession): Promise<void> {
    const { roomId, cookie, nickname } = session
    try {
      const ok = await webHeartbeat(roomId, cookie)
      if (!ok) this.app.logger.log(`[${nickname}] 直播间 ${roomId} 心跳发送失败`)
    } catch (err) {
      this.app.logger.log(
        `[${nickname}] 直播间 ${roomId} 心跳发送失败: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  stopWatch(accessKey: string, roomId: string): void {
    const key = this.key(accessKey, roomId)
    const session = this.sessions.get(key)
    if (!session) return

    this.sessions.delete(key)
    if (session.httpTimer) clearInterval(session.httpTimer)
    session.ws?.close()
    this.app.logger.log(`[${session.nickname}] 直播间 ${roomId} 任务已停止`)
    this.emitChanged()
  }

  /** Start for many accounts at once. Failures are logged per account. */
  async startMany(roomId: string, accounts: Array<{ key: string; nickname: string }>): Promise<void> {
    const upId = await fetchRoomUpId(roomId).catch(() => null)
    if (!upId) {
      this.app.logger.log(`无法获取直播间 ${roomId} 的主播信息`)
      return
    }

    await mapLimit(accounts, 5, async (account) => {
      await this.startWatch(account.key, roomId, upId, account.nickname)
    })
    this.app.logger.log('挂榜任务已启动')
  }

  async stopMany(roomId: string, accounts: Array<{ key: string }>): Promise<void> {
    for (const account of accounts) {
      this.stopWatch(account.key, roomId)
    }
    this.app.logger.log('挂榜任务已停止')
  }

  stopAll(): void {
    for (const key of [...this.sessions.keys()]) {
      const session = this.sessions.get(key)
      if (!session) continue
      this.stopWatch(session.accessKey, session.roomId)
    }
  }
}
