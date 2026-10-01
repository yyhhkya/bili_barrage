import { EventEmitter } from 'node:events'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateInfo, UpdateProgress } from '../shared/types'
import { GITHUB_REPO, UA } from './bili/constants'
import { biliGet } from './bili/http'
import type { Logger } from './core/logger'

const { autoUpdater } = electronUpdater

/**
 * Update checking and applying.
 *
 * This file is short on purpose. Replacing a running executable means waiting
 * on the old process, staging the new binary, renaming, relaunching and rolling
 * back on failure. electron-updater owns all of that, which is only possible
 * because the packaged build is an NSIS install rather than a bare .exe.
 */
export class Updater extends EventEmitter {
  private progress: UpdateProgress = { percent: 0, status: 'idle', message: '' }

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
      const res = await biliGet<GitHubRelease>(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': UA.short } }
      )

      // A non-200 is not the same as "up to date", and the UI renders both as
      // the absence of a badge. GitHub's unauthenticated API allows 60 requests
      // per hour per IP, so a 403 here really does happen. Log it, otherwise a
      // rate-limited check is indistinguishable from a genuinely current one.
      if (res.status !== 200) {
        this.logger.log(
          `检查更新失败: HTTP ${res.status}` +
            (res.status === 403 ? '（GitHub API 限流，未认证请求每小时 60 次）' : '')
        )
      }

      return parseRelease(current, res.status, res.body)
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

/** The subset of GitHub's release payload this app reads. */
export interface GitHubRelease {
  tag_name?: string
  html_url?: string
  body?: string
}

/**
 * Turn a GitHub `releases/latest` response into an `UpdateInfo`.
 *
 * Split out of `Updater.check()` so it can be exercised without the network.
 * That matters here: the unauthenticated GitHub API allows 60 requests per hour
 * per IP, so an end-to-end check is not something a test suite can rely on, and
 * the tag handling in this function is exactly the part that was wrong before.
 *
 * `tag` is returned exactly as GitHub reports it. This repo's tags are bare
 * (`2.4.1`), but `v2.4.1` is the more common convention and nothing enforces
 * one, so callers must never reconstruct it from the version number.
 */
export function parseRelease(
  currentVersion: string,
  status: number,
  body: GitHubRelease | undefined
): UpdateInfo {
  const noUpdate: UpdateInfo = { has_update: false, current_version: currentVersion }
  if (status !== 200) return noUpdate

  const tag = body?.tag_name ?? ''
  if (!tag) return noUpdate

  const latest = tag.replace(/^v/, '')
  if (!isNewer(latest, currentVersion)) return noUpdate

  return {
    has_update: true,
    current_version: currentVersion,
    latest_version: latest,
    tag,
    url: body?.html_url ?? '',
    body: body?.body ?? ''
  }
}
