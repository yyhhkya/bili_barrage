import type { LoginPollResult } from '../../shared/types'
import { pollQrLogin, requestQrCode } from '../bili/endpoints'
import { renderQrCode } from './emoticons'
import type { Logger } from './logger'

/**
 * QR login ("扫码登录") using the TV endpoint.
 *
 * Pull-based: the renderer polls `poll()` every 2.5 s because the underlying
 * Bilibili endpoint is itself a poll. On success the renderer resolves the
 * nickname and adds the account, so the account list stays its concern.
 *
 * Known rough edge: any code other than 0 returns `pending`, so an expired code
 * (86038) polls forever instead of reporting expiry. The renderer's cancel
 * button is the escape hatch.
 */
export class QrLogin {
  private authCode: string | null = null
  private cancelled = false

  constructor(private readonly logger: Logger) {}

  /** Returns a PNG data URL for the QR image, or null if the request failed. */
  async start(): Promise<string | null> {
    this.cancelled = false
    this.authCode = null

    try {
      this.logger.log('开始扫码登录...')
      const { url, authCode } = await requestQrCode()
      this.authCode = authCode
      return await renderQrCode(url)
    } catch (err) {
      this.logger.log(`扫码登录失败: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /** One poll. Returns `pending` while unconfirmed, else the access key. */
  async poll(): Promise<LoginPollResult> {
    if (this.cancelled || !this.authCode) return 'failed'

    try {
      const result = await pollQrLogin(this.authCode)
      if (result !== 'pending') {
        this.authCode = null
        this.logger.log('扫码登录成功')
      }
      return result
    } catch (err) {
      this.logger.log(`登录轮询失败: ${err instanceof Error ? err.message : String(err)}`)
      return 'pending'
    }
  }

  cancel(): void {
    this.cancelled = true
    this.authCode = null
  }
}
