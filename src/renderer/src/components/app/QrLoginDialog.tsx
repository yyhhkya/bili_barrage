import { useCallback, useEffect, useRef, useState } from 'react'
import { UserCircle } from '@phosphor-icons/react'
import { Dialog, DialogContent } from '../ui/dialog'
import { EmptyState, Skeleton } from '../ui/states'
import { useToast } from '../../lib/toast'

const POLL_MS = 2500

/**
 * QR login dialog.
 *
 * Polls the main process every 2.5 s, because the underlying Bilibili endpoint
 * is itself a poll. This is the one polling loop the refactor kept: everything
 * else was replaced by main-process push events.
 */
export function QrLoginDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.ReactElement {
  const toast = useToast()
  const [image, setImage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [exchanging, setExchanging] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopped = useRef(false)

  const stopPolling = useCallback(() => {
    stopped.current = true
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    if (stopped.current) return
    try {
      const result = await window.api.pollLogin()
      if (stopped.current) return

      if (result === 'pending') {
        timer.current = setTimeout(() => void poll(), POLL_MS)
        return
      }

      if (result === 'failed') {
        setFailed(true)
        return
      }

      // Anything else is an access key.
      setExchanging(true)
      const nickname = (await window.api.getNickname(result)) || '未命名账号'
      await window.api.addAccount(nickname, result)
      toast.success(`已添加账号 ${nickname}`)
      stopped.current = true
      onOpenChange(false)
    } catch (err) {
      if (!stopped.current) {
        setFailed(true)
        toast.error(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setExchanging(false)
    }
  }, [onOpenChange, toast])

  // Start on open, cancel on close so a stray poll cannot add an account later.
  useEffect(() => {
    if (!open) return

    stopped.current = false
    setImage(null)
    setFailed(false)

    let cancelled = false
    void (async () => {
      const dataUrl = await window.api.startScanLogin()
      if (cancelled || stopped.current) return
      if (!dataUrl) {
        setFailed(true)
        return
      }
      setImage(dataUrl)
      timer.current = setTimeout(() => void poll(), POLL_MS)
    })()

    return () => {
      cancelled = true
      stopPolling()
      void window.api.cancelLogin()
    }
  }, [open, poll, stopPolling])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopPolling()
        onOpenChange(next)
      }}
    >
      <DialogContent
        open={open}
        title="扫码登录"
        description="用 B 站手机客户端扫描二维码。"
        width="sm"
      >
        <div className="flex flex-col items-center gap-3 py-2">
          {failed ? (
            <EmptyState
              icon={<UserCircle size={18} />}
              title="二维码获取失败"
              description="网络异常或接口返回错误。关闭后重试即可。"
            />
          ) : image ? (
            <>
              <img
                src={image}
                alt="登录二维码"
                width={200}
                height={200}
                className="rounded-panel border border-line"
              />
              <p className="text-[12.5px] text-ink-2">
                {exchanging ? '正在获取账号信息...' : '等待扫码确认，成功后会自动添加账号'}
              </p>
            </>
          ) : (
            <Skeleton className="size-[200px] rounded-panel" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
