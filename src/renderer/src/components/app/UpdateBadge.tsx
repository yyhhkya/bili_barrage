import { useEffect, useState } from 'react'
import { ArrowCircleUp, ArrowSquareOut, CheckCircle, Download } from '@phosphor-icons/react'
import type { UpdateInfo, UpdateProgress } from '@shared/types'
import { useToast } from '../../lib/toast'
import { Button } from '../ui/button'
import { Dialog, DialogContent } from '../ui/dialog'
import { ReleaseNotes } from './ReleaseNotes'

/**
 * Version badge plus the update dialog.
 *
 * The update downloads and installs through electron-updater, which talks to
 * GitHub directly. When that connection is blocked, "前往 GitHub" opens the
 * release page in the system browser as the manual fallback.
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

  // One check per launch is enough; a background poll would only add noise.
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

            {/*
              Release notes are Markdown, so they are rendered rather than
              dumped as text; raw `##` and `**` in the dialog was the whole
              problem this solves. Scrolls past ~14rem so a long changelog
              cannot push the buttons off screen.
            */}
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">更新内容</p>
              {info?.body?.trim() ? (
                <div className="max-h-56 overflow-y-auto rounded-panel border border-line bg-surface px-3.5 py-3 text-[12.5px] text-ink-2">
                  <ReleaseNotes markdown={info.body} />
                </div>
              ) : (
                // A release with no body is common (GitHub only fills it in if
                // the author does). Saying so beats silently dropping the
                // section, which reads like the dialog is broken.
                <div className="rounded-panel border border-dashed border-line bg-surface px-3.5 py-3 text-[12.5px] text-ink-3">
                  本次发布没有填写更新说明。
                  {info?.url ? (
                    <>
                      {' '}
                      <a
                        href={info.url}
                        onClick={(e) => {
                          e.preventDefault()
                          void window.api.openExternal(info.url ?? '')
                        }}
                        className="text-accent-ink underline underline-offset-2 hover:text-ink"
                      >
                        在 GitHub 上查看
                      </a>
                    </>
                  ) : null}
                </div>
              )}
            </div>

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
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
