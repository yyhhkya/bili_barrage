import { useEffect, useState } from 'react'
import { ArrowCircleUp, ArrowSquareOut, CheckCircle, Download } from '@phosphor-icons/react'
import type { MirrorResult, UpdateInfo, UpdateProgress } from '@shared/types'
import { useToast } from '../../lib/toast'
import { Button } from '../ui/button'
import { Dialog, DialogContent } from '../ui/dialog'

/**
 * Version badge plus the update dialog.
 *
 * Mirrors are offered for the manual-download path only: electron-updater talks
 * to GitHub directly and cannot take a URL prefix. The automatic path hides the
 * download entirely, so the mirror picker is a fallback for users behind a
 * blocked connection.
 */
export function UpdateBadge(): React.ReactElement {
  const toast = useToast()
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress>({
    percent: 0,
    status: 'idle',
    message: ''
  })
  const [mirrors, setMirrors] = useState<MirrorResult[]>([])
  const [testing, setTesting] = useState(false)

  // One check per launch, matching the original.
  useEffect(() => {
    void (async () => {
      try {
        setInfo(await window.api.checkUpdate())
      } catch {
        // A failed check is not worth surfacing; the app works offline.
      }
    })()

    return window.api.onUpdateProgress(setProgress)
  }, [])

  useEffect(() => {
    if (progress.status === 'done') {
      const t = setTimeout(() => void window.api.quitAndInstall(), 1200)
      return () => clearTimeout(t)
    }
    return undefined
  }, [progress.status])

  async function download(): Promise<void> {
    try {
      await window.api.downloadUpdate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function testMirrors(): Promise<void> {
    setTesting(true)
    try {
      setMirrors(await window.api.testMirrors())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      {info?.has_update ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press flex w-full items-center gap-1.5 rounded-control px-1 py-1 text-left text-[11.5px] text-accent-ink hover:bg-accent-wash"
        >
          <ArrowCircleUp size={13} weight="fill" />
          有新版本 v{info.latest_version}
        </button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          open={open}
          title="发现新版本"
          width="md"
          dismissable={progress.status !== 'downloading'}
          footer={
            <>
              <Button onClick={() => setOpen(false)} disabled={progress.status === 'downloading'}>
                稍后再说
              </Button>
              <Button
                onClick={() => {
                  if (info?.url) void window.api.openExternal(info.url)
                }}
                disabled={progress.status === 'downloading'}
              >
                <ArrowSquareOut size={14} />
                前往 GitHub
              </Button>
              <Button
                variant="primary"
                onClick={() => void download()}
                disabled={progress.status === 'downloading'}
              >
                <Download size={14} weight="bold" />
                {progress.status === 'downloading' ? '下载中...' : '立即更新'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex gap-6 text-[13px]">
              <p className="text-ink-2">
                当前版本 <span className="font-mono text-ink">v{info?.current_version}</span>
              </p>
              <p className="text-ink-2">
                最新版本{' '}
                <span className="font-mono font-medium text-accent-ink">
                  v{info?.latest_version}
                </span>
              </p>
            </div>

            {info?.body ? (
              <div>
                <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">更新内容</p>
                <div className="max-h-52 overflow-y-auto rounded-panel border border-line bg-subtle p-3 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
                  {info.body}
                </div>
              </div>
            ) : null}

            {progress.status !== 'idle' ? (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                  <div
                    className={
                      'h-full rounded-full transition-[width] duration-300 ' +
                      (progress.status === 'error'
                        ? 'bg-danger'
                        : progress.status === 'done'
                          ? 'bg-ok'
                          : 'bg-ink')
                    }
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-2">
                  {progress.status === 'done' ? <CheckCircle size={13} weight="fill" /> : null}
                  {progress.message}
                </p>
              </div>
            ) : null}

            <div className="border-t border-line pt-3.5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12.5px] font-medium text-ink-2">手动下载线路</p>
                  <p className="text-[12px] text-ink-3">
                    自动更新走 GitHub 直连。连不上时，先测速再选一条线路用浏览器下载。
                  </p>
                </div>
                <Button size="sm" onClick={() => void testMirrors()} disabled={testing}>
                  {testing ? '检测中...' : '测速'}
                </Button>
              </div>

              {mirrors.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {mirrors.map((mirror) => (
                    <Button
                      key={mirror.prefix || 'direct'}
                      size="sm"
                      disabled={mirror.status === 'error'}
                      onClick={() =>
                        void window.api.openManualDownload(
                          mirror.prefix,
                          info?.latest_version ?? ''
                        )
                      }
                    >
                      {mirror.name}
                      {mirror.status === 'ok' ? (
                        <span className="font-mono text-[11px] text-ink-3">
                          {mirror.latency}ms
                        </span>
                      ) : mirror.status === 'error' ? (
                        <span className="text-[11px] text-ink-3">超时</span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
