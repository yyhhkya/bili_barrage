import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { AppState, WatchEntry } from '@shared/types'

interface StoreValue {
  state: AppState
  watch: WatchEntry[]
  logs: string[]
  ready: boolean
  clearLogs: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

const EMPTY_STATE: AppState = { accounts: [], tasks: [], version: '' }

/**
 * Single source of truth for renderer state.
 *
 * The main process pushes `state:changed` / `watch:changed` / `log:line`, so
 * nothing here polls. Log lines can arrive in bursts, so they are batched at
 * roughly 10 fps before hitting React state.
 */
export function StoreProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [watch, setWatch] = useState<WatchEntry[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  // Log lines can arrive faster than React can render them; batch at ~10 fps.
  const pending = useRef<string[]>([])
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) return
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null
      const batch = pending.current
      if (!batch.length) return
      pending.current = []
      setLogs((prev) => {
        const next = prev.concat(batch)
        // Keep the DOM bounded; the file on disk is the real record.
        return next.length > 3000 ? next.slice(next.length - 3000) : next
      })
    }, 100)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const [initial, history, initialWatch] = await Promise.all([
        window.api.getState(),
        window.api.getLogHistory(),
        window.api.getWatchStatus()
      ])
      if (cancelled) return
      setState(initial)
      setLogs(history)
      setWatch(initialWatch)
      setReady(true)
    })()

    const offState = window.api.onStateChanged(setState)
    const offWatch = window.api.onWatchChanged(setWatch)
    const offLog = window.api.onLogLine((line) => {
      pending.current.push(line)
      scheduleFlush()
    })

    return () => {
      cancelled = true
      if (flushTimer.current) clearTimeout(flushTimer.current)
      offState()
      offWatch()
      offLog()
    }
  }, [scheduleFlush])

  const clearLogs = useCallback(() => {
    pending.current = []
    setLogs([])
    void window.api.clearLogs()
  }, [])

  const value = useMemo<StoreValue>(
    () => ({ state, watch, logs, ready, clearLogs }),
    [state, watch, logs, ready, clearLogs]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

/** Convenience: accounts, tasks and version. */
export function useAppState(): AppState {
  return useStore().state
}

export function useWatch(): WatchEntry[] {
  return useStore().watch
}

export function useLogs(): { logs: string[]; clearLogs: () => void } {
  const { logs, clearLogs } = useStore()
  return { logs, clearLogs }
}
