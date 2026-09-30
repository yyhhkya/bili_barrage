import type { Transition, Variants } from 'motion/react'

/**
 * Shared motion vocabulary.
 *
 * MOTION_INTENSITY is 5: state feedback and layout continuity, never
 * choreography. Concretely that means:
 *   - durations stay in the 120-260ms band (anything longer feels sluggish in a
 *     tool you use daily)
 *   - spring for anything the user physically pushed; eased tween for anything
 *     the system did on its own
 *   - no entrance sequences on page switch; the third time you watch a page
 *     fade in, it is in the way
 *   - never animate width/height/top/left. transform + opacity only, or the
 *     compositor is bypassed and frames drop.
 *
 * Everything here is consumed through `useReducedMotion()` at the call site.
 * The CSS fallback in tokens.css covers CSS transitions; it cannot cover these,
 * because they are driven from JS.
 */

/** A key the user pressed. Slight overshoot reads as physical. */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 30,
  mass: 0.7
}

/** Something the system moved on its own: layout shifts, shared elements. */
export const springSoft: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 32,
  mass: 0.9
}

/** Short eased tween, for anything that should feel instantaneous but not jump. */
export const quickFade: Transition = { duration: 0.14, ease: [0.16, 1, 0.3, 1] }

/** Overlay enter/exit: scale + fade from the trigger. */
export const overlayVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: -3 }
}

/** Slide in from the right, for toasts. */
export const toastVariants: Variants = {
  hidden: { opacity: 0, x: 24, scale: 0.98 },
  visible: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 12, scale: 0.98 }
}

/** Modal enter/exit. Slightly more travel than a popover. */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 4 }
}

/** Report nothing for reduced motion; reuse at every call site. */
export const reducedVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
}
