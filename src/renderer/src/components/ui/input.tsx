import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const field =
  'w-full rounded-control border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:bg-subtle'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(field, 'h-8', className)} {...props} />
  }
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(field, 'resize-y py-2 leading-relaxed', className)} {...props} />
})

/** Mono variant, for anything the user reads character by character. */
export const MonoInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function MonoInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(field, 'h-8 font-mono text-[12.5px] tracking-tight', className)}
        {...props}
      />
    )
  }
)
