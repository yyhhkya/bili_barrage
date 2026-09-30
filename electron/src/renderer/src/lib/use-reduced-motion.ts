import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * `prefers-reduced-motion`, live.
 *
 * Motion ships a `useReducedMotion()`, but its implementation captures the
 * value once at mount and discards the setter:
 *
 *     const [shouldReduceMotion] = useState(prefersReducedMotion.current)
 *
 * (their source carries a TODO about it). That means it never updates when the
 * setting changes while the app is running, so a user who turns on "reduce
 * motion" in Windows and comes back to an already-open window keeps getting the
 * full animation.
 *
 * This hook subscribes to the media query instead. In Electron it also matters
 * that the renderer is long-lived: the window is often left open for days, so
 * reacting to a change is not hypothetical.
 *
 * Reading `matchMedia` at render time on every render would be wasteful; the
 * initial state is read once and the listener is attached for updates. The
 * subscription is torn down on unmount.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(QUERY)

    // Re-read on attach: the value can have changed between the initial render
    // and effect commit.
    setReduced(mql.matches)

    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
