import fs from 'node:fs'
import path from 'node:path'

const RETAIN_DAYS = 7
const TIMESTAMP_RE = /^\[(\d{4}-\d{2}-\d{2})/

type LogListener = (line: string) => void

/**
 * File-backed logger with a replayable ring buffer.
 *
 * Behaviour:
 * - `latest.log` holds the current run
 * - on startup the previous `latest.log` is archived to `<date>-<n>.log`
 * - archives older than 7 days are deleted on startup
 *
 * The ring buffer is new: the renderer subscribes to a push channel instead of
 * polling `get_new_logs` every 500 ms, so it needs a backlog on (re)connect.
 */
export class Logger {
  private readonly logDir: string
  private readonly currentFile: string
  private readonly listeners = new Set<LogListener>()
  private readonly buffer: string[] = []
  private readonly bufferLimit = 2000

  constructor(logDir: string) {
    this.logDir = logDir
    fs.mkdirSync(this.logDir, { recursive: true })
    this.cleanupOldLogs()
    this.currentFile = path.join(this.logDir, 'latest.log')
    this.archivePrevious()
  }

  private cleanupOldLogs(): void {
    const cutoff = Date.now() - RETAIN_DAYS * 86_400_000
    let entries: string[]
    try {
      entries = fs.readdirSync(this.logDir)
    } catch {
      return
    }

    for (const name of entries) {
      if (name === 'latest.log' || !name.endsWith('.log')) continue
      const match = name.match(TIMESTAMP_RE)
      if (!match) continue
      const fileTime = Date.parse(`${match[1]}T00:00:00`)
      if (Number.isNaN(fileTime) || fileTime >= cutoff) continue
      try {
        fs.rmSync(path.join(this.logDir, name))
      } catch {
        // Unreadable or locked; skip.
      }
    }
  }

  /** Move the previous run's `latest.log` aside, deriving its date from line 1. */
  private archivePrevious(): void {
    if (!fs.existsSync(this.currentFile)) return

    try {
      const content = fs.readFileSync(this.currentFile, 'utf-8')
      if (!content.trim()) return

      const firstLine = content.split('\n', 1)[0].trim()
      const match = firstLine.match(TIMESTAMP_RE)
      const dateStr = match ? match[1] : new Date().toISOString().slice(0, 10)

      let seq = 1
      while (fs.existsSync(path.join(this.logDir, `${dateStr}-${seq}.log`))) seq++
      fs.writeFileSync(path.join(this.logDir, `${dateStr}-${seq}.log`), content, 'utf-8')
      fs.writeFileSync(this.currentFile, '', 'utf-8')
    } catch {
      // Archiving is best-effort; never block startup on it.
    }
  }

  log(message: string): void {
    const ts = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const stamp =
      `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ` +
      `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`
    const line = `[${stamp}] ${message}`

    this.buffer.push(line)
    if (this.buffer.length > this.bufferLimit) this.buffer.shift()

    for (const listener of this.listeners) {
      try {
        listener(line)
      } catch {
        // A broken subscriber must not break logging.
      }
    }

    try {
      fs.appendFileSync(this.currentFile, `${line}\n`, 'utf-8')
    } catch {
      // Disk full / permission denied; the in-memory buffer still has it.
    }
  }

  /** Backlog for a newly connected renderer. */
  history(): string[] {
    return [...this.buffer]
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.buffer.length = 0
  }
}
