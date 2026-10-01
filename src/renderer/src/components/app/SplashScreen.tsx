import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../../lib/use-reduced-motion'
import { springSnappy } from '../../lib/motion'
import { cn } from '../../lib/utils'

/**
 * One-time startup animation.
 *
 * Plays on app launch, then unmounts for good. Shares the app's palette, font
 * and motion vocabulary — no three.js, no WebGL: the mark is 2D and the whole
 * thing lives under ~1.6s, so a compositor-only transform/opacity animation is
 * lighter and sharper than a 3D scene would be, and it collapses cleanly under
 * reduced motion.
 *
 * Reduced motion: logo + title appear with a plain fade, no fly-in, shorter
 * hold. Click anywhere to skip early.
 */

// Cute danmaku that fly past behind the mark. Thematic: this IS a danmaku tool.
const BULLETS = [
  { text: '6666', top: '16%', delay: 0.25, dur: 1.15, tone: 'gold' },
  { text: 'awsl', top: '30%', delay: 0.5, dur: 1.3, tone: 'plain' },
  { text: '好耶 ✧', top: '68%', delay: 0.35, dur: 1.2, tone: 'gold' },
  { text: '笑死', top: '82%', delay: 0.62, dur: 1.0, tone: 'plain' },
  { text: '前方高能', top: '11%', delay: 0.72, dur: 1.35, tone: 'plain' },
  { text: '哈哈哈哈', top: '58%', delay: 0.9, dur: 1.1, tone: 'gold' }
] as const

export function SplashScreen(): React.ReactElement | null {
  const reduce = useReducedMotion()
  const [show, setShow] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShow(false), reduce ? 650 : 1650)
    return () => clearTimeout(t)
  }, [reduce])

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="splash"
          onClick={() => setShow(false)}
          role="status"
          aria-label="启动中"
          className="fixed inset-0 z-[100] grid cursor-pointer place-items-center overflow-hidden bg-app"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: reduce ? 1 : 1.05 }}
          transition={{ duration: reduce ? 0.2 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Warm radial vignette for depth. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'radial-gradient(circle at 50% 44%, #fff8e1 0%, #fffbf2 62%)' }}
          />

          {/* Danmaku layer, behind the mark. */}
          {!reduce ? (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {BULLETS.map((b, i) => (
                <motion.span
                  key={i}
                  className={cn(
                    'absolute whitespace-nowrap rounded-full border px-3 py-1 text-[13px]',
                    b.tone === 'gold'
                      ? 'border-accent/30 bg-accent-wash text-accent-ink'
                      : 'border-line bg-surface text-ink-2'
                  )}
                  style={{ top: b.top, left: '-24%' }}
                  initial={{ x: 0, opacity: 0 }}
                  animate={{ x: '150vw', opacity: [0, 1, 1, 0] }}
                  transition={{
                    delay: b.delay,
                    duration: b.dur,
                    ease: 'linear',
                    times: [0, 0.12, 0.82, 1]
                  }}
                />
              ))}
            </div>
          ) : null}

          {/* Center mark. */}
          <div className="relative flex flex-col items-center gap-5">
            <div className="relative grid place-items-center">
              {/* Pulsing ring: a soft gold shockwave around the tile. */}
              {!reduce ? (
                <motion.span
                  aria-hidden
                  className="absolute size-28 rounded-[32px] border-2 border-accent"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.75, opacity: 0 }}
                  transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity, delay: 0.3 }}
                />
              ) : null}

              {/* Gold tile carrying 弹, the app mark, in the UI font. */}
              <motion.div
                className="relative grid size-28 place-items-center rounded-[32px]"
                style={{
                  background: 'linear-gradient(#F7C948, #E3A81C)',
                  boxShadow: 'var(--shadow-gold)'
                }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -14 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={reduce ? { duration: 0.3 } : { ...springSnappy, delay: 0.05 }}
              >
                <span className="font-display text-[66px] leading-none text-[#FFFDF7]">弹</span>
              </motion.div>
            </div>

            {/* Wordmark. */}
            <motion.div
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0.12 : 0.46, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1 className="font-display text-[27px] leading-none text-ink">弹幕助手</h1>
              <p className="font-mono text-[12px] tracking-wide text-ink-3">bili-barrage</p>
            </motion.div>

            {/* Bouncing loader dots. */}
            {!reduce ? (
              <motion.div
                className="flex gap-1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="block size-2 rounded-full bg-accent"
                    animate={{ y: [0, -6, 0] }}
                    transition={{
                      duration: 0.6,
                      ease: 'easeInOut',
                      repeat: Infinity,
                      delay: 0.7 + i * 0.12
                    }}
                  />
                ))}
              </motion.div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
