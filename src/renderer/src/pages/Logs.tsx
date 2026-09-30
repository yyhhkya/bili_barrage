import { useEffect, useMemo, useRef, useState } from 'react'
import { TerminalWindow, Trash, FolderOpen } from '@phosphor-icons/react'
import { useLogs } from '../lib/store'
import { useToast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { PageHeader, Panel, PanelHeader } from '../components/ui/panel'
import { EmptyState } from '../components/ui/states'
import { cn } from '../lib/utils'

/** Severity is inferred from the line text; the main process logs plain strings. */
function severity(line: string): 'error' | 'warn' | 'muted' {
  if (/失败|错误|异常|超时|失败:/.test(line)) return 'error'
  if (/失败|重试|取消/.test(line)) return 'warn'
  if (/已停止|已关闭|暂无/.test(line)) return 'muted'
  return 'muted'
}

const SEVERITY_CLASS = {
  error: 'text-danger',
  warn: 'text-warn',
  muted: 'text-ink-2'
} as const

export function LogsPage(): React.ReactElement {
  const { logs, clearLogs } = useLogs()
  const toast = useToast()
  const [follow, setFollow] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)

  // Only auto-scroll while the user is pinned to the bottom.
  useEffect(() => {
    if (!follow) return
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs, follow])

  const rendered = useMemo(() => logs.slice(-2000), [logs])

  function onScroll(): void {
    const el = scroller.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setFollow(atBottom)
  }

  async function openLogFolder(): Promise<void> {
    try {
      const paths = await window.api.getPaths()
      await window.api.openPath(paths.logs)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <PageHeader
        title="日志"
        description="滚动实时刷新。完整历史按天保存在日志目录，保留 7 天。"
        actions={
          <>
            <Button size="sm" onClick={() => void openLogFolder()}>
              <FolderOpen size={14} />
              打开日志目录
            </Button>
            <Button size="sm" onClick={clearLogs} disabled={!logs.length}>
              <Trash size={14} />
              清空
            </Button>
          </>
        }
      />

      <Panel className="flex h-[calc(100vh-190px)] flex-col overflow-hidden">
        <PanelHeader title="实时输出" />

        {rendered.length === 0 ? (
          <EmptyState
            icon={<TerminalWindow size={18} />}
            title="暂无日志"
            description="账号操作、发送记录和挂榜心跳都会出现在这里。"
          />
        ) : (
          <div
            ref={scroller}
            onScroll={onScroll}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            {rendered.map((line, i) => (
              <div
                key={i}
                className={cn(
                  'font-mono text-[12px] leading-[1.7] break-all whitespace-pre-wrap',
                  SEVERITY_CLASS[severity(line)]
                )}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
