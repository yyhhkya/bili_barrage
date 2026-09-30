import WebSocket from 'ws'
import { TIMING } from './constants'

/** Operation codes used by this app. Only auth and heartbeat are ever sent. */
const OP_HEARTBEAT = 2
const OP_AUTH = 7

/**
 * Bilibili live-room WebSocket client.
 *
 * Deliberately mirrors the Python `BiliLiveWS`, including its limitations:
 * - **Send-only.** There is no message handler. Incoming frames (including the
 *   zlib-compressed op-3 popularity packets that `protover: 2` requests) are
 *   received and dropped.
 * - **No reconnect.** If the socket drops, it stays dropped. Presence is kept
 *   alive by the separate HTTP heartbeat in watch.ts.
 * - Heartbeat is a self-rescheduling 30 s timer, so drift accumulates the same
 *   way `threading.Timer` did.
 *
 * Adding op-3 decoding and reconnect is a follow-up, not part of this port.
 */
export class BiliLiveWS {
  private ws: WebSocket | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private closed = false

  constructor(
    private readonly roomId: string,
    private readonly uid: number,
    private readonly token: string,
    private readonly host: string,
    private readonly port: number,
    private readonly log: (msg: string) => void,
    private readonly remark: string
  ) {}

  /** 16-byte big-endian header, then the UTF-8 body. */
  private encodePacket(op: number, body: string): Buffer {
    const bodyBytes = Buffer.from(body, 'utf-8')
    const packet = Buffer.alloc(16 + bodyBytes.length)
    packet.writeUInt32BE(16 + bodyBytes.length, 0)
    packet.writeUInt16BE(16, 4)
    packet.writeUInt16BE(1, 6)
    packet.writeUInt32BE(op, 8)
    packet.writeUInt32BE(1, 12)
    bodyBytes.copy(packet, 16)
    return packet
  }

  connect(): void {
    const address = `wss://${this.host}:${this.port}/sub`
    this.log(`[${this.remark}] 正在连接 WebSocket: ${address}`)

    // ws sends no protocol-level pings unless pingInterval is set, matching
    // websocket-client's default. Liveness relies solely on the op-2 heartbeat.
    const ws = new WebSocket(address, { handshakeTimeout: 10_000 })
    this.ws = ws

    ws.on('open', () => {
      this.log(`[${this.remark}] 直播间 ${this.roomId} WebSocket 已连接`)
      this.sendAuth()
    })

    ws.on('error', (err: Error) => {
      this.log(`[${this.remark}] 直播间 ${this.roomId} WebSocket 错误: ${err.message}`)
    })

    ws.on('close', (code: number) => {
      this.stopHeartbeat()
      this.log(`[${this.remark}] 直播间 ${this.roomId} WebSocket 已关闭 (code=${code})`)
    })

    // Intentionally no 'message' handler. Incoming frames are dropped.
  }

  private sendAuth(): void {
    const auth = {
      uid: this.uid,
      roomid: Number(this.roomId),
      protover: 2,
      platform: 'web',
      type: 2,
      key: this.token
    }
    this.send(this.encodePacket(OP_AUTH, JSON.stringify(auth)))
    this.startHeartbeat()
  }

  private send(data: Buffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(data)
      } catch {
        // Swallowed upstream too; the close handler will report the real failure.
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), TIMING.wsHeartbeat)
  }

  private sendHeartbeat(): void {
    // The literal "[object Object]" is what the reference implementations send,
    // and what the server accepts. Not valid JSON, deliberately preserved.
    this.send(this.encodePacket(OP_HEARTBEAT, '[object Object]'))
    if (!this.closed) this.startHeartbeat()
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  close(): void {
    this.closed = true
    this.stopHeartbeat()
    const ws = this.ws
    this.ws = null
    if (!ws) return
    try {
      ws.close(1000)
      // ws has no close timeout; force-terminate shortly after to match the
      // Python 0.5 s close(timeout=...) behaviour.
      const t = setTimeout(() => ws.terminate(), 500)
      ws.once('close', () => clearTimeout(t))
    } catch {
      // Already gone.
    }
  }
}
