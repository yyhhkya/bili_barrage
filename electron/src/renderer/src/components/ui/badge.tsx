import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from '../../lib/use-reduced-motion'
import { cn } from '../../lib/utils'
import { springSnappy } from '../../lib/motion'
import { AnimatedNumber } from './animated-number'
import type { TaskStatus } from '@shared/types'

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'

const TONE: Record<Tone, string> = {
  neutral: 'bg-subtle text-ink-2 border-line',
  ok: 'bg-ok-wash text-ok border-[#cfe8c9]',
  warn: 'bg-warn-wash text-warn border-[#f0dcb4]',
  danger: 'bg-danger-wash text-danger border-[#f2cfc9]',
  accent: 'bg-accent-wash text-accent-ink border-[#ecd9a8]'
}

export function Badge({
  tone = 'neutral',
  mono = false,
  children,
  className
}: {
  tone?: Tone
  mono?: boolean
  children: ReactNode
  className?: string
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-5 font-medium',
        mono && 'font-mono tabular-nums',
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

const STATUS_TONE: Record<TaskStatus, Tone> = {
  运行中: 'ok',
  启动中: 'warn',
  停止中: 'warn',
  停止: 'neutral'
}

/** Task state as a badge. The dot is semantic here, not decoration. */
export function StatusPill({ status }: { status: TaskStatus }): React.ReactElement {
  const reduce = useReducedMotion() ?? false
  return (
    <motion.span
      layout
      transition={reduce ? { duration: 0 } : springSnappy}
      className="inline-flex"
    >
      <Badge tone={STATUS_TONE[status]}>
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            status === '运行中' && 'bg-ok',
            (status === '启动中' || status === '停止中') && 'bg-warn',
            status === '停止' && 'bg-line-strong'
          )}
        />
        {status}
      </Badge>
    </motion.span>
  )
}

/**
 * Counts with a ceiling. Warns as the account approaches the daily like cap,
 * which is the reason the original showed these numbers at all.
 *
 * When the tone escalates (neutral -> warn -> danger) the badge cross-fades
 * rather than snapping. That transition is the whole point of the widget: it is
 * the only place the UI warns you that an account is nearing its limit.
 */
export function CountBadge({
  value,
  limit,
  label
}: {
  value: number
  limit: number
  label: string
}): React.ReactElement {
  const ratio = limit > 0 ? value / limit : 0
  const tone: Tone = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warn' : 'neutral'
  const reduce = useReducedMotion() ?? false

  return (
    <motion.span
      layout
      transition={reduce ? { duration: 0 } : springSnappy}
      className="inline-flex"
    >
      <Badge tone={tone} mono>
        {label} <AnimatedNumber value={value} />
      </Badge>
    </motion.span>
  )
}
