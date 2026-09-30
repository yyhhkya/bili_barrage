import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../../lib/use-reduced-motion'
import type { ReactNode } from 'react'
import { Button } from './button'
import { cn } from '../../lib/utils'
import { dialogVariants, quickFade, reducedVariants, springSoft } from '../../lib/motion'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

/**
 * `open` is required, and that is deliberate.
 *
 * Radix unmounts its content the moment `open` flips false, so an exit
 * animation is impossible unless the node is kept mounted (`forceMount`) and
 * its presence is driven by AnimatePresence. Keeping it mounted
 * unconditionally would leave an invisible dialog in the DOM swallowing clicks,
 * so AnimatePresence is gated on `open` and the caller passes the same value it
 * gives `<Dialog>`.
 */
export function DialogContent({
  open,
  title,
  description,
  children,
  footer,
  width = 'md',
  dismissable = true,
  className
}: {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
  dismissable?: boolean
  className?: string
}): React.ReactElement {
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }
  const reduce = useReducedMotion() ?? false
  const variants = reduce ? reducedVariants : dialogVariants

  return (
    <DialogPrimitive.Portal forceMount>
      <AnimatePresence>
        {open ? (
          <>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={quickFade}
                className="fixed inset-0 z-40 bg-[rgb(74_55_40_/_0.28)] backdrop-blur-[1px]"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content
              asChild
              forceMount
              onInteractOutside={(e) => {
                if (!dismissable) e.preventDefault()
              }}
              onEscapeKeyDown={(e) => {
                if (!dismissable) e.preventDefault()
              }}
            >
              <motion.div
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={variants}
                // Reduced motion keeps a short opacity cross-fade (a fade is not
                // vestibular motion) but must not spring, so the transform stays
                // pinned at scale 1 / y 0.
                transition={reduce ? quickFade : springSoft}
                className={cn(
                  'fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
                  'max-h-[calc(100vh-4rem)] rounded-overlay border border-line bg-surface shadow-overlay',
                  widths[width],
                  className
                )}
              >
                <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="font-display text-[15px] font-medium text-ink">
                      {title}
                    </DialogPrimitive.Title>
                    {description ? (
                      <DialogPrimitive.Description className="mt-0.5 text-[12.5px] text-ink-2">
                        {description}
                      </DialogPrimitive.Description>
                    ) : null}
                  </div>
                  {dismissable ? (
                    <DialogPrimitive.Close asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="关闭"
                        className="-mt-1 -mr-1.5 px-1.5"
                      >
                        <X size={15} />
                      </Button>
                    </DialogPrimitive.Close>
                  ) : null}
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

                {footer ? (
                  <footer className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
                    {footer}
                  </footer>
                ) : null}
              </motion.div>
            </DialogPrimitive.Content>
          </>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Portal>
  )
}
