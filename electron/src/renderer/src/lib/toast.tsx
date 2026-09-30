import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from './use-reduced-motion'
import { CheckCircle, WarningCircle, XCircle, X } from '@phosphor-icons/react'
import { cn } from './utils'
import { springSnappy } from './motion'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const KIND_STYLE: Record<ToastKind, { icon: ReactNode; ring: string }> = {
  success: { icon: <CheckCircle size={18} weight="fill" />, ring: 'text-ok' },
  error: { icon: <XCircle size={18} weight="fill" />, ring: 'text-danger' },
  info: { icon: <WarningCircle size={18} weight="fill" />, ring: 'text-ink-2' }
}

/**
 * Toast host. Transient feedback only; anything persistent belongs inline on
 * the page that owns it.
 */
export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const reduce = useReducedMotion() ?? false

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }])
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500)
    },
    [dismiss]
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m)
    }),
    [push]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-80 flex-col gap-2">
        {/*
          No AnimatePresence here on purpose. Toasts are added and removed on a
          timer, and a list that re-tweens every time an older entry expires is
          noise. Each toast animates itself in on mount; dismissal is instant.
        */}
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={springSnappy}
            className="pointer-events-auto flex items-start gap-2.5 rounded-panel border border-line bg-surface px-3.5 py-3 shadow-overlay"
          >
            <span className={cn('mt-px shrink-0', KIND_STYLE[toast.kind].ring)}>
              {KIND_STYLE[toast.kind].icon}
            </span>
            <p className="min-w-0 flex-1 text-[13px] leading-snug break-words text-ink">
              {toast.message}
            </p>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => dismiss(toast.id)}
              className="press -mt-0.5 -mr-1 shrink-0 rounded-compact p-1 text-ink-3 hover:bg-subtle hover:text-ink"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
