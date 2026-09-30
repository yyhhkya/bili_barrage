import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useReducedMotion } from '../../lib/use-reduced-motion'

/**
 * Count-up value.
 *
 * Written with motion values rather than state: a counter that re-renders the
 * React tree on every frame is the classic way to make an otherwise smooth
 * number janky. `useTransform` maps the motion value to a rounded string and
 * only the text node updates.
 *
 * Reduced motion renders the final value immediately, no animation.
 */
export function AnimatedNumber({
  value,
  className,
  duration = 0.5
}: {
  value: number
  className?: string
  duration?: number
}): React.ReactElement {
  const reduce = useReducedMotion() ?? false
  const count = useMotionValue(value)
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString('en-US'))
  const previous = useRef(value)

  useEffect(() => {
    if (reduce) {
      count.set(value)
      previous.current = value
      return
    }

    const from = previous.current
    previous.current = value

    // Only animate upward and by a modest step. A big jump is usually a data
    // reload rather than a real increment, and spinning from 0 to 5000 is
    // theatre, not information.
    const delta = value - from
    if (delta <= 0 || delta > 2000) {
      count.set(value)
      return
    }

    const controls = animate(count, value, { duration, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [value, reduce, count, duration])

  return <motion.span className={className}>{rounded}</motion.span>
}
