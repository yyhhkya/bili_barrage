import fs from 'node:fs'
import path from 'node:path'
import type { Account, Task } from '../../shared/types'

export interface ConfigFile {
  accounts: Account[]
  tasks: Task[]
  /** Flattened as `date|room_id|account_key` -> count, same as the Python version. */
  like_counts: Record<string, number>
}

const EMPTY: ConfigFile = { accounts: [], tasks: [], like_counts: {} }

/**
 * Normalises a task loaded from disk.
 * `job_id` is gone (timers live in memory), but old config files still carry it,
 * so it is stripped rather than rejected.
 */
function normalizeTask(raw: unknown, index: number): Task | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>

  const status = t.status
  return {
    id: typeof t.id === 'number' ? t.id : index + 1,
    room_id: String(t.room_id ?? ''),
    room_remark: String(t.room_remark ?? ''),
    content: String(t.content ?? ''),
    accounts: Array.isArray(t.accounts) ? (t.accounts as string[]) : [],
    account_keys: Array.isArray(t.account_keys) ? (t.account_keys as string[]) : [],
    interval: Number(t.interval) || 5,
    // A task that was running when the app died must not come back as "运行中"
    // with no timer behind it. It is restored explicitly by the task manager.
    status: status === '运行中' ? '停止' : ((status as Task['status']) ?? '停止'),
    current_content_index: Number(t.current_content_index) || 0
  }
}

function normalizeAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (typeof a.key !== 'string' || !a.key) return null
  return { nickname: String(a.nickname ?? ''), key: a.key }
}

export function readConfig(configPath: string): ConfigFile {
  if (!fs.existsSync(configPath)) return { ...EMPTY }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<ConfigFile>
    return {
      accounts: (parsed.accounts ?? [])
        .map(normalizeAccount)
        .filter((a): a is Account => a !== null),
      tasks: (parsed.tasks ?? [])
        .map(normalizeTask)
        .filter((t): t is Task => t !== null),
      like_counts: parsed.like_counts ?? {}
    }
  } catch {
    return { ...EMPTY }
  }
}

/** Write via temp file + rename so a crash mid-write cannot truncate the config. */
export function writeConfig(configPath: string, config: ConfigFile): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  const tmp = `${configPath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8')
  fs.renameSync(tmp, configPath)
}

/**
 * Reads a config.json produced by the Python build so accounts and tasks can be
 * carried over. Only the portable fields are taken: like_counts refers to the
 * old run's dates, and `job_id` has no meaning here.
 */
export function readLegacyConfig(legacyPath: string): { accounts: Account[]; tasks: Task[] } {
  const parsed = readConfig(legacyPath)
  return { accounts: parsed.accounts, tasks: parsed.tasks }
}
