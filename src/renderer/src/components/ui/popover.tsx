import * as PopoverPrimitive from '@radix-ui/react-popover'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../../lib/use-reduced-motion'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { overlayVariants, quickFade, reducedVariants } from '../../lib/motion'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

/**
 * `open` is required so AnimatePresence can play the exit; Radix would unmount
 * immediately otherwise. See dialog.tsx for the same reasoning.
 */
export function PopoverContent({
  open,
  children,
  className,
  sideOffset = 6
}: {
  open: boolean
  children: ReactNode
  className?: string
  sideOffset?: number
}): React.ReactElement {
  const reduce = useReducedMotion() ?? false

  return (
    <PopoverPrimitive.Portal forceMount>
      <AnimatePresence>
        {open ? (
          <PopoverPrimitive.Content
            asChild
            forceMount
            side="bottom"
            align="start"
            sideOffset={sideOffset}
            collisionPadding={12}
          >
            <motion.div
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={reduce ? reducedVariants : overlayVariants}
              transition={quickFade}
              className={cn(
                'z-50 rounded-overlay border border-line bg-surface p-3.5 shadow-overlay',
                className
              )}
            >
              {children}
            </motion.div>
          </PopoverPrimitive.Content>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Portal>
  )
}
