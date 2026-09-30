import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from './lib/use-reduced-motion'
import {
  UserCircle,
  ChatCircleDots,
  ThumbsUp,
  Broadcast,
  ClockCountdown,
  TerminalWindow,
  type Icon
} from '@phosphor-icons/react'
import { cn } from './lib/utils'
import { springSoft } from './lib/motion'
import { StoreProvider, useAppState } from './lib/store'
import { ToastProvider } from './lib/toast'
import { AccountsPage } from './pages/Accounts'
import { SendPage } from './pages/Send'
import { LikesPage } from './pages/Likes'
import { WatchPage } from './pages/Watch'
import { TasksPage } from './pages/Tasks'
import { LogsPage } from './pages/Logs'
import { UpdateBadge } from './components/app/UpdateBadge'
import { TitleBar } from './components/app/TitleBar'

type PageId = 'accounts' | 'send' | 'likes' | 'watch' | 'tasks' | 'logs'

interface NavItem {
  id: PageId
  label: string
  icon: Icon
}

const NAV: NavItem[] = [
  { id: 'accounts', label: '账号管理', icon: UserCircle },
  { id: 'send', label: '发送弹幕', icon: ChatCircleDots },
  { id: 'likes', label: '点赞', icon: ThumbsUp },
  { id: 'watch', label: '挂榜', icon: Broadcast },
  { id: 'tasks', label: '定时任务', icon: ClockCountdown },
  { id: 'logs', label: '日志', icon: TerminalWindow }
]

function Sidebar({
  active,
  onSelect
}: {
  active: PageId
  onSelect: (id: PageId) => void
}): React.ReactElement {
  const { version } = useAppState()
  const reduce = useReducedMotion() ?? false

  return (
    <nav className="flex w-[204px] shrink-0 flex-col gap-0 border-r border-line bg-surface">
      <ul className="flex flex-1 flex-col gap-1 px-2.5 pt-3">
        {NAV.map((item) => {
          const isActive = item.id === active
          const Glyph = item.icon
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'press group relative flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-[13px] font-medium',
                  isActive ? 'text-ink' : 'text-ink-2 hover:text-ink'
                )}
              >
                {/*
                  Hover fill and the active fill are separate layers.

                  They cannot be the same node: the active one is a shared
                  element (layoutId) that Motion moves between rows, and a
                  hovered row is not part of that travel. Painting hover
                  underneath also means moving the pointer across the list does
                  not disturb the shared element mid-flight.

                  `group-hover` is suppressed on the active row so the two
                  layers never stack into a darker double-fill.
                */}
                {!isActive ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-control bg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  />
                ) : null}

                {/*
                  One sliding object, not two.

                  The row highlight is the shared element: it travels between
                  rows, and its radius and size come along for free, so it
                  reads as a single object moving rather than a redraw.
                */}
                {isActive ? (
                  <motion.span
                    layoutId="nav-active"
                    aria-hidden
                    className="absolute inset-0 -z-0 rounded-control bg-subtle"
                    transition={reduce ? { duration: 0 } : springSoft}
                  />
                ) : null}

                <span
                  aria-hidden
                  className="relative z-10 grid size-6 shrink-0 place-items-center"
                >
                  {/*
                    The gold icon chip is deliberately NOT a second shared
                    element. Having both it and the row highlight fly across the
                    list at once reads as two things racing, and the chip is a
                    small square while the row is a wide pill, so the two
                    trajectories look unrelated.

                    Fading it in place keeps the emphasis on the row, which is
                    the element that actually carries the meaning.
                  */}
                  <motion.span
                    aria-hidden
                    initial={false}
                    animate={{ opacity: isActive ? 1 : 0, scale: reduce ? 1 : isActive ? 1 : 0.8 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 rounded-[8px] bg-accent"
                  />
                  <span className={cn('relative', isActive ? 'text-ink' : 'text-ink-2')}>
                    <Glyph size={15} weight={isActive ? 'fill' : 'regular'} />
                  </span>
                </span>

                <span className="relative z-10">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto border-t border-line px-3.5 py-3">
        <UpdateBadge />
        <p className="px-1 pt-1 font-mono text-[11.5px] text-ink-3">v{version || '...'}</p>
      </div>
    </nav>
  )
}

/**
 * Pages are built here, from the id, rather than looked up at render time.
 *
 * This matters for the transition: AnimatePresence keeps the outgoing element
 * mounted long enough to play its exit. If the content came from a `current`
 * lookup, that element would re-render with the *new* page's component while
 * still keyed to the old page, and the exit would animate the wrong content.
 * Deriving it from the id makes each element self-contained.
 */
const PAGES: Record<PageId, () => ReactNode> = {
  accounts: () => <AccountsPage />,
  send: () => <SendPage />,
  likes: () => <LikesPage />,
  watch: () => <WatchPage />,
  tasks: () => <TasksPage />,
  logs: () => <LogsPage />
}

function Shell(): React.ReactElement {
  const [page, setPage] = useState<PageId>('accounts')
  const reduce = useReducedMotion()
  const scroller = useRef<HTMLElement>(null)

  /**
   * Directional hint: content enters from the side of the list the user moved
   * toward. Derived from nav order, so it needs no per-page configuration.
   */
  const index = NAV.findIndex((n) => n.id === page)
  const previousIndex = useRef(index)
  const goingDown = index >= previousIndex.current
  useEffect(() => {
    previousIndex.current = index
  }, [index])

  /**
   * Each page is its own scroll context, so a new one must start at the top.
   * Without this, scrolling the log viewer then switching lands you halfway
   * down the next page.
   */
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [page])

  const offset = reduce ? 0 : goingDown ? 10 : -10

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar active={page} onSelect={setPage} />

        {/*
          mode="wait" so only one page is ever mounted. These pages own timers
          and IPC subscriptions; cross-fading two would double every
          subscription and could fire a stray QR poll or log flush.

          The exit is deliberately far shorter than the enter. An even split
          makes the switch feel like it is lagging behind the click, and by the
          time the content moves the nav pill has already arrived.
        */}
        <main ref={scroller} className="min-w-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page}
              initial={{ opacity: 0, y: offset }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 0, transition: { duration: reduce ? 0 : 0.07 } }}
              transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto max-w-[1080px] px-7 py-6"
            >
              {PAGES[page]()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

export default function App(): React.ReactElement {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  )
}
