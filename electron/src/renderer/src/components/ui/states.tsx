import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Empty state. Every list and table in this app has one, with the action that
 * resolves it where an action exists.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 px-6 py-14 text-center',
        className
      )}
    >
      <span className="mb-1.5 grid size-9 place-items-center rounded-full bg-subtle text-ink-3">
        {icon}
      </span>
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-2">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

/** Skeleton block matching the shape of the content it stands in for. */
export function Skeleton({ className }: { className?: string }): React.ReactElement {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-compact bg-subtle', className)}
    />
  )
}

/** Table-shaped loading state, so the layout does not jump when data lands. */
export function TableSkeleton({ rows = 4 }: { rows?: number }): React.ReactElement {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="ml-auto h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Inline error block, for failures that belong to the page rather than a toast. */
export function ErrorState({
  message,
  onRetry
}: {
  message: string
  onRetry?: () => void
}): React.ReactElement {
  return (
    <div className="flex items-start gap-3 rounded-panel border border-[#f2cfc9] bg-danger-wash px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-danger">操作失败</p>
        <p className="mt-0.5 text-[12.5px] break-words text-[#8c2f22]">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="press shrink-0 rounded-control border border-[#f2cfc9] bg-surface px-2.5 py-1 text-[12.5px] font-medium text-danger hover:bg-[#fdf6f4]"
        >
          重试
        </button>
      ) : null}
    </div>
  )
}
