import type { Account } from '@shared/types'
import { Checkbox } from '../ui/checkbox'
import { cn } from '../../lib/utils'

/**
 * Multi-select account list. Indices are positions in the account array, which
 * is the addressing scheme the main process expects.
 */
export function AccountPicker({
  accounts,
  selected,
  onChange,
  trailing
}: {
  accounts: Account[]
  selected: number[]
  onChange: (next: number[]) => void
  /** Optional per-account extra badge, e.g. today's like count. */
  trailing?: (account: Account, index: number) => React.ReactNode
}): React.ReactElement {
  const allSelected = accounts.length > 0 && selected.length === accounts.length
  const someSelected = selected.length > 0 && !allSelected

  function toggle(index: number): void {
    onChange(
      selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index]
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <label className="press flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2 hover:text-ink">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={() => onChange(allSelected ? [] : accounts.map((_, i) => i))}
          />
          全选
        </label>
        {selected.length ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="press text-[12.5px] text-ink-3 hover:text-ink-2"
          >
            清空
          </button>
        ) : null}
      </div>

      <div className="grid gap-1 rounded-panel border border-line bg-subtle p-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account, index) => {
          const isOn = selected.includes(index)
          return (
            <label
              key={account.key}
              className={cn(
                'press flex cursor-pointer items-center gap-2 rounded-control border px-2 py-1.5',
                isOn
                  ? 'border-line bg-surface'
                  : 'border-transparent hover:bg-surface'
              )}
            >
              <Checkbox checked={isOn} onCheckedChange={() => toggle(index)} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {account.nickname || <span className="text-ink-3">未命名</span>}
              </span>
              {trailing?.(account, index)}
            </label>
          )
        })}
      </div>
    </div>
  )
}
