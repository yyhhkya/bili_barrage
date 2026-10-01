import path from 'node:path'
import { EventEmitter } from 'node:events'
import type { Account, AppState, LikeCountTotal, Task, WatchEntry } from '../../shared/types'
import { readConfig, writeConfig, type ConfigFile } from './config'
import { Logger } from './logger'
import { WatchManager } from './watch'
import { TaskRunner } from './tasks'

/**
 * Central application state.
 *
 * Concurrency note: everything here runs on one event loop, so the shared
 * `accounts` / `tasks` / watch state cannot be torn by concurrent writers the
 * way it would be with real threads. Timer handles are still tracked
 * explicitly, because a leaked interval outlives the page that started it.
 */
export class AppCore extends EventEmitter {
  readonly logger: Logger
  readonly configPath: string
  readonly watchManager: WatchManager
  readonly taskRunner: TaskRunner

  accounts: Account[] = []
  tasks: Task[] = []

  /** (date, room_id, account_key) -> count. "date" is a local YYYY-MM-DD. */
  private likeCounts = new Map<string, number>()

  constructor(
    userDataDir: string,
    /** From Electron's app.getVersion(). Passed in so this layer stays Electron-free. */
    private readonly version: string
  ) {
    super()
    this.configPath = path.join(userDataDir, 'config.json')
    this.logger = new Logger(path.join(userDataDir, 'logs'))
    this.loadConfig()

    this.watchManager = new WatchManager(this)
    this.taskRunner = new TaskRunner(this)

    this.watchManager.on('changed', (entries: WatchEntry[]) => this.emit('watch:changed', entries))
    this.taskRunner.on('changed', () => this.emitState())

    this.logger.subscribe((line) => this.emit('log:line', line))
  }

  // ------------------------------------------------------------- config

  private loadConfig(): void {
    const cfg = readConfig(this.configPath)
    this.accounts = cfg.accounts
    this.tasks = cfg.tasks
    this.loadLikeCounts(cfg.like_counts)
  }

  saveConfig(): void {
    const today = todayStr()
    const likeCounts: Record<string, number> = {}
    for (const [key, count] of this.likeCounts) {
      // Only today's counts are kept; older rows are dropped on save.
      if (splitLikeKey(key)[0] === today) likeCounts[key] = count
    }

    const cfg: ConfigFile = {
      accounts: this.accounts,
      // Timers are in-memory only; `up_id` never belongs in the file.
      tasks: this.tasks.map(({ up_id: _upId, ...rest }) => rest),
      like_counts: likeCounts
    }

    try {
      writeConfig(this.configPath, cfg)
    } catch (err) {
      this.logger.log(`保存配置失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ----------------------------------------------------------- accounts

  addAccount(nickname: string, key: string): void {
    this.accounts.push({ nickname, key })
    this.saveConfig()
    this.logger.log(`添加账号: ${nickname}`)
    this.emitState()
  }

  editAccount(index: number, nickname: string, key: string): void {
    if (index < 0 || index >= this.accounts.length) return
    this.accounts[index] = { nickname, key }
    this.saveConfig()
    this.logger.log(`编辑账号: ${nickname}`)
    this.emitState()
  }

  deleteAccount(index: number): void {
    if (index < 0 || index >= this.accounts.length) return
    const nickname = this.accounts[index].nickname
    this.accounts.splice(index, 1)
    this.saveConfig()
    this.logger.log(`删除账号: ${nickname}`)
    this.emitState()
  }

  /**
   * Reorder accounts to match the given key order. Keys are the stable identity
   * (tasks reference accounts by key, not position), so a reorder never breaks
   * task bindings. Ignored unless `keys` is a pure permutation of the current
   * accounts — a shape change means the caller is stale.
   */
  reorderAccounts(keys: readonly string[]): void {
    const byKey = new Map(this.accounts.map((a) => [a.key, a]))
    const next: Account[] = []
    for (const k of keys) {
      const a = byKey.get(k)
      if (a) {
        next.push(a)
        byKey.delete(k)
      }
    }
    if (next.length !== this.accounts.length) return
    this.accounts = next
    this.saveConfig()
    this.emitState()
  }

  accountByKey(key: string): Account | undefined {
    return this.accounts.find((a) => a.key === key)
  }

  /** Resolve positional selections, dropping out-of-range indices. */
  selectAccounts(indices: readonly number[]): Account[] {
    return indices
      .filter((i) => i >= 0 && i < this.accounts.length)
      .map((i) => this.accounts[i])
  }

  // -------------------------------------------------------- like counts

  private loadLikeCounts(raw: Record<string, number>): void {
    const today = todayStr()
    for (const [key, count] of Object.entries(raw)) {
      const [date] = splitLikeKey(key)
      if (date === today) this.likeCounts.set(key, count)
    }
  }

  recordLikeCount(roomId: string, accountKey: string, clickTime: number): void {
    const key = likeKey(todayStr(), roomId, accountKey)
    this.likeCounts.set(key, (this.likeCounts.get(key) ?? 0) + clickTime)
    this.saveConfig()
  }

  /** {account_key: count} for one room, today. */
  getLikeCounts(roomId: string): Record<string, number> {
    const out: Record<string, number> = {}
    for (const acc of this.accounts) {
      out[acc.key] = this.likeCounts.get(likeKey(todayStr(), roomId, acc.key)) ?? 0
    }
    return out
  }

  /** Per-account totals across all rooms, plus the per-room breakdown. */
  getLikeCountsTotal(): LikeCountTotal[] {
    const today = todayStr()
    const totals = new Map<string, number>()
    const details = new Map<string, Record<string, number>>()

    for (const [key, count] of this.likeCounts) {
      const [date, room, accKey] = splitLikeKey(key)
      if (date !== today) continue
      totals.set(accKey, (totals.get(accKey) ?? 0) + count)
      const rooms = details.get(accKey) ?? {}
      rooms[room] = count
      details.set(accKey, rooms)
    }

    return this.accounts.map((acc) => ({
      nickname: acc.nickname,
      key: acc.key,
      total: totals.get(acc.key) ?? 0,
      rooms: details.get(acc.key) ?? {}
    }))
  }

  // -------------------------------------------------------------- state

  getState(): AppState {
    return { accounts: this.accounts, tasks: this.tasks, version: this.version }
  }

  emitState(): void {
    this.emit('state:changed', this.getState())
  }

  /** Stops every timer and socket. Called on app quit. */
  shutdown(): void {
    this.taskRunner.stopAll()
    this.watchManager.stopAll()
  }
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function likeKey(date: string, roomId: string, accountKey: string): string {
  return `${date}|${roomId}|${accountKey}`
}

function splitLikeKey(key: string): [string, string, string] {
  const parts = key.split('|')
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '']
}
