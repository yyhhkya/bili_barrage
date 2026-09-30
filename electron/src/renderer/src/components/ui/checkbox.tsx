import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'

export function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.CheckboxProps): React.ReactElement {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'press grid size-4 shrink-0 place-items-center rounded-compact border border-line-strong bg-surface',
        'hover:border-ink-3',
        'data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white',
        'data-[state=indeterminate]:border-ink data-[state=indeterminate]:bg-ink data-[state=indeterminate]:text-white',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        {props.checked === 'indeterminate' ? (
          <Minus size={11} weight="bold" />
        ) : (
          <Check size={11} weight="bold" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

/** Checkbox with an inline label, sized so it reads as one tappable row. */
export function CheckboxRow({
  label,
  trailing,
  className,
  ...props
}: CheckboxPrimitive.CheckboxProps & {
  label: React.ReactNode
  trailing?: React.ReactNode
}): React.ReactElement {
  const id = `cb-${String(props.value ?? label)}`
  return (
    <label
      htmlFor={id}
      className={cn(
        // No box until hover: a border on every row reads as visual noise. The
        // multi-select grid in AccountPicker supplies its own container.
        'press flex cursor-pointer items-center gap-2 rounded-control border border-transparent px-2 py-1.5',
        'hover:bg-subtle',
        className
      )}
    >
      <Checkbox id={id} {...props} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{label}</span>
      {trailing}
    </label>
  )
}
