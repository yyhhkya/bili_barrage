import { EventEmitter } from 'node:events'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { MirrorResult, UpdateInfo, UpdateProgress } from '../shared/types'
import { GITHUB_REPO, UA } from './bili/constants'
import { biliGet } from './bili/http'
import type { Logger } from './core/logger'

const { autoUpdater } = electronUpdater

/**
 * Mirror probing. These are download accelerators for GitHub release assets,
 * used for the manual-download path only: electron-updater talks to GitHub
 * directly and has no concept of a URL prefix.
 */
const MIRRORS: Array<{ name: string; prefix: string }> = [
  { name: 'GitHub 直连', prefix: '' },
  { name: 'gh-proxy.org', prefix: 'https://gh-proxy.org/' },
  { name: 'ghproxy.net', prefix: 'https://ghproxy.net/' }
]

/**
 * Update checking and applying.
 *
 * The Python build downloaded a bare .exe and swapped it in place with a
 * generated batch script (PID wait, .new/.backup rename dance, three restart
 * attempts, rollback). electron-updater owns all of that now, which is why this
 * file is short: packaged builds are NSIS installers that it can replace.
 */
export class Updater extends EventEmitter {
  private progress: UpdateProgress = { percent: 0, status: 'idle', message: '' }
  private mirrorResults: MirrorResult[] = MIRRORS.map((m) => ({
    name: m.name,
    prefix: m.prefix,
    latency: -1,
    status: 'pending'
  }))

  constructor(private readonly logger: Logger) {
    super()

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    autoUpdater.on('download-progress', (p) => {
      const percent = Math.min(Math.floor(p.percent), 99)
      this.setProgress({
        percent,
        status: 'downloading',
        message: `下载中 ${percent}% (${(p.transferred / 1048576).toFixed(1)}/${(p.total / 1048576).toFixed(1)} MB)`
      })
    })

    autoUpdater.on('update-downloaded', () => {
      this.setProgress({ percent: 100, status: 'done', message: '下载完成，正在重启应用...' })
    })

    autoUpdater.on('error', (err: Error) => {
      this.logger.log(`更新失败: ${err.message}`)
      this.setProgress({ percent: 0, status: 'error', message: `更新失败: ${err.message}` })
    })
  }

  private setProgress(next: UpdateProgress): void {
    this.progress = next
    this.emit('progress', next)
  }

  getProgress(): UpdateProgress {
    return this.progress
  }

  getMirrorResults(): MirrorResult[] {
    return this.mirrorResults
  }

  /**
   * Compares the local version against the latest GitHub release.
   *
   * Kept on the GitHub REST API rather than `autoUpdater.checkForUpdates()`
   * because the dialog needs the changelog body and release URL, and because
   * checking should work in dev builds too.
   */
  async check(): Promise<UpdateInfo> {
    const current = app.getVersion()
    try {
      const res = await biliGet<{
        tag_name?: string
        html_url?: string
        body?: string
      }>(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': UA.short }
      })

      if (res.status !== 200) return { has_update: false, current_version: current }

      const tag = res.body?.tag_name ?? ''
      const latest = tag.replace(/^v/, '')

      if (!isNewer(latest, current)) return { has_update: false, current_version: current }

      return {
        has_update: true,
        current_version: current,
        latest_version: latest,
        url: res.body?.html_url ?? '',
        body: res.body?.body ?? ''
      }
    } catch (err) {
      this.logger.log(`检查更新失败: ${err instanceof Error ? err.message : String(err)}`)
      return { has_update: false, current_version: current }
    }
  }

  /** Download and stage the update. Applies on quit. */
  async download(): Promise<void> {
    this.setProgress({ percent: 0, status: 'downloading', message: '正在获取版本信息...' })
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.updateInfo) {
        this.setProgress({ percent: 0, status: 'error', message: '获取更新信息失败' })
        return
      }
      await autoUpdater.downloadUpdate()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.log(`下载更新失败: ${msg}`)
      this.setProgress({ percent: 0, status: 'error', message: `下载失败: ${msg}` })
    }
  }

  /** Restart into the downloaded version. */
  quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }

  /**
   * Probe each mirror for reachability. A 4xx still counts as reachable, so the
   * test is `status < 500`, matching the Python implementation.
   */
  async testMirrors(): Promise<MirrorResult[]> {
    this.mirrorResults = MIRRORS.map((m) => ({
      name: m.name,
      prefix: m.prefix,
      latency: -1,
      status: 'testing'
    }))
    this.emit('mirrors', this.mirrorResults)

    await Promise.all(
      MIRRORS.map(async (mirror, index) => {
        const target = mirror.prefix
          ? new URL(mirror.prefix).origin + '/'
          : `https://github.com/${GITHUB_REPO}/releases`

        const started = Date.now()
        try {
          const res = await fetch(target, {
            redirect: 'follow',
            signal: AbortSignal.timeout(5000)
          })
          const latency = Date.now() - started
          this.mirrorResults[index] = {
            name: mirror.name,
            prefix: mirror.prefix,
            latency: res.status < 500 ? latency : -1,
            status: res.status < 500 ? 'ok' : 'error'
          }
        } catch {
          this.mirrorResults[index] = {
            name: mirror.name,
            prefix: mirror.prefix,
            latency: -1,
            status: 'error'
          }
        }
        this.emit('mirrors', this.mirrorResults)
      })
    )

    return this.mirrorResults
  }
}

/**
 * Numeric segment comparison, matching `_compare_versions`.
 * Not semver: `1.2` sorts below `1.2.0`, and any pre-release suffix is ignored.
 */
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const b = current.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return a.length > b.length
}

/** Manual download fallback: hand the (optionally mirror-prefixed) URL to the browser. */
export function buildManualDownloadUrl(mirrorPrefix: string, version: string): string {
  const asset = `bili-barrage-Setup-${version}.exe`
  return `${mirrorPrefix}https://github.com/${GITHUB_REPO}/releases/download/v${version}/${asset}`
}
