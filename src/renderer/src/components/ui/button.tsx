import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

/*
 * Primary action is the golden key: gold face, DARK BROWN label, and a darker
 * gold lip underneath so it reads as a soft physical button.
 *
 * The label colour is not a style choice. White on #F5C542 is 1.62:1 and fails
 * WCAG AA badly; cocoa #4A3728 on the same gold is 6.93:1. Every variant below
 * was measured against its own fill.
 */
const button = cva(
  'press inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none',
  {
    variants: {
      variant: {
        primary: 'btn-gold bg-accent text-ink hover:bg-accent-hover',
        secondary:
          'border border-line-strong bg-surface text-ink shadow-[0_1px_0_rgb(227_211_180_/_0.9)] hover:bg-subtle',
        ghost: 'text-ink-2 hover:bg-subtle hover:text-ink',
        danger:
          'border border-[#f2cfc9] bg-surface text-danger hover:bg-danger-wash hover:border-[#e8b8b0]',
        info: 'border border-[#cddff2] bg-surface text-info hover:bg-info-wash'
      },
      size: {
        sm: 'h-7 rounded-[10px] px-3 text-[12.5px]',
        md: 'h-9 rounded-control px-3.5 text-[13px]',
        lg: 'h-10 rounded-control px-5 text-[13.5px]'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonProps): React.ReactElement {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(button({ variant, size }), className)} {...props} />
}
