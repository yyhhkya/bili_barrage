import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** A bordered content region. Used only where elevation means something. */
export function Panel({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): React.ReactElement {
  return (
    <section
      className={cn(
        'rounded-panel border border-line bg-surface shadow-panel',
        className
      )}
    >
      {children}
    </section>
  )
}

export function PanelHeader({
  title,
  hint,
  actions
}: {
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
}): React.ReactElement {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-medium text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12px] text-ink-2">{hint}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** Page title row. One heading, one optional action cluster, no eyebrow. */
export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: string
  actions?: ReactNode
}): React.ReactElement {
  return (
    <header className="mb-5 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-[19px] leading-tight font-medium tracking-tight text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-[12.5px] text-ink-2">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** Labelled field. Label sits above the control; never a placeholder-as-label. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  children: ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

/** Table shell. Rows are separated by hairlines; the header is tinted once. */
export function Table({
  head,
  children,
  empty
}: {
  head: ReactNode
  children: ReactNode
  empty?: ReactNode
}): React.ReactElement {
  return (
    <Panel className="overflow-hidden">
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-subtle text-left text-[12px] text-ink-2">
          {head}
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </Panel>
  )
}

export function Th({
  children,
  className
}: {
  children?: ReactNode
  className?: string
}): React.ReactElement {
  return (
    <th
      className={cn(
        'border-b border-line px-3.5 py-2 font-medium whitespace-nowrap',
        className
      )}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className
}: {
  children?: ReactNode
  className?: string
}): React.ReactElement {
  return (
    <td className={cn('border-b border-line px-3.5 py-2.5 align-middle', className)}>
      {children}
    </td>
  )
}
