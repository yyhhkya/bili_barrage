import type { ReactNode } from 'react'
import { Button } from './button'
import { Dialog, DialogContent } from './dialog'

/**
 * Secondary-confirmation dialog for destructive actions.
 *
 * Built on `DialogContent` so it inherits the same overlay, animation and focus
 * behaviour as every other modal. `danger` tints the confirm button red; use it
 * for deletes. `loading` disables both buttons while the action is in flight so
 * a double-click can't fire the action twice.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  loading = false,
  onConfirm
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        open={open}
        title={title}
        width="sm"
        footer={
          <>
            <Button onClick={() => onOpenChange(false)} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button
              variant={danger ? 'danger' : 'primary'}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? '处理中...' : confirmLabel}
            </Button>
          </>
        }
      >
        {description ? (
          <p className="text-[13px] leading-relaxed text-ink-2">{description}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
