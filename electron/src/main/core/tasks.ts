import { EventEmitter } from 'node:events'
import type { Task } from '../../shared/types'
import type { AppCore } from './app'
import { fetchRoomUpId, likeRoom, sendDanmaku } from '../bili/endpoints'
import { mapLimit, sleep } from './concurrency'
import { TIMING } from '../bili/constants'

const MINUTE = 60_000
const CONCURRENCY = 10

interface RunningTask {
  task: Task
  timer: NodeJS.Timeout | null
}

/**
 * Scheduled danmaku sending.
 *
 * Behaviour preserved:
 * - starting a task also starts watch/presence for its accounts
 * - the first danmaku is sent immediately; the interval fires after N minutes
 * - `content` is comma-separated and rotated one entry per tick, wrapping
 * - a task with no usable content entries is a no-op
 * - stopping a task also stops watch for its accounts
 *
 * One deliberate change: `schedule` ran jobs serially from a single polling
 * thread, so a slow send could not overlap the next tick. An async
 * `setInterval` could, so a per-task in-flight guard restores that serialisation.
 */
export class TaskRunner extends EventEmitter {
  private readonly running = new Map<number, RunningTask>()
  private readonly inFlight = new Set<number>()

  constructor(private readonly app: AppCore) {
    super()
  }

  /** Resume tasks that were marked 运行中 when the app last exited. */
  async resumePersisted(): Promise<void> {
    for (const task of [...this.app.tasks]) {
      if (task.status === '运行中') await this.start(task, { resumed: true })
    }
  }

  async start(task: Task, opts: { resumed?: boolean } = {}): Promise<void> {
    if (this.running.has(task.id)) return

    task.status = '启动中'
    this.emit('changed')

    const log = (m: string): void => this.app.logger.log(m)

    try {
      const upId = await fetchRoomUpId(task.room_id)
      if (!upId) {
        log(`无法获取直播间 ${task.room_id} 的主播信息，任务启动失败`)
        task.status = '停止'
        this.emit('changed')
        return
      }

      await mapLimit(this.targets(task), 5, (account) =>
        this.app.watchManager.startWatch(account.key, task.room_id, upId, account.nickname)
      )

      this.running.set(task.id, { task, timer: null })

      // Immediate first send, matching the explicit `job()` call upstream.
      await this.runOnce(task)

      const entry = this.running.get(task.id)
      if (entry) {
        entry.timer = setInterval(() => void this.runOnce(task), task.interval * MINUTE)
      }

      task.status = '运行中'
      task.up_id = String(upId)
      this.app.saveConfig()
      this.emit('changed')
      log(
        opts.resumed
          ? `自动启动定时任务: 房间 ${task.room_id}, 间隔 ${task.interval} 分钟`
          : `启动定时任务: 房间 ${task.room_id}, 间隔 ${task.interval} 分钟`
      )
    } catch (err) {
      log(`启动任务失败: ${err instanceof Error ? err.message : String(err)}`)
      task.status = '停止'
      this.emit('changed')
    }
  }

  /** The accounts referenced by this task that still exist. */
  private targets(task: Task): Array<{ key: string; nickname: string }> {
    return task.account_keys
      .map((key) => this.app.accountByKey(key))
      .filter((a): a is { key: string; nickname: string } => Boolean(a))
  }

  private async runOnce(task: Task): Promise<void> {
    if (this.inFlight.has(task.id)) return
    this.inFlight.add(task.id)

    try {
      const contents = task.content
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
      if (!contents.length) return

      const index = task.current_content_index ?? 0
      const current = contents[index % contents.length]

      await this.sendToAccounts(task.room_id, current, this.targets(task), 0, true)
      task.current_content_index = (index + 1) % contents.length
    } finally {
      this.inFlight.delete(task.id)
    }
  }

  async stop(task: Task): Promise<void> {
    const entry = this.running.get(task.id)
    if (entry?.timer) clearInterval(entry.timer)
    this.running.delete(task.id)

    task.status = '停止中'
    this.emit('changed')

    try {
      for (const key of task.account_keys) {
        this.app.watchManager.stopWatch(key, task.room_id)
      }
      task.status = '停止'
      this.app.saveConfig()
      this.emit('changed')
      this.app.logger.log(`停止定时任务: 房间 ${task.room_id}`)
    } catch (err) {
      this.app.logger.log(`停止任务失败: ${err instanceof Error ? err.message : String(err)}`)
      task.status = '运行中'
      this.emit('changed')
    }
  }

  stopAll(): void {
    for (const entry of this.running.values()) {
      if (entry.timer) clearInterval(entry.timer)
    }
    this.running.clear()
  }

  /** Fire one danmaku from many accounts, in parallel or with a gap between each. */
  async sendToAccounts(
    roomId: string,
    content: string,
    accounts: Array<{ key: string; nickname: string }>,
    dmType = 0,
    concurrent = false
  ): Promise<void> {
    const send = async (account: { key: string; nickname: string }): Promise<void> => {
      this.app.logger.log(
        `[${account.nickname}] 尝试向房间 ${roomId} 发送弹幕: ${content} (dm_type=${dmType})`
      )
      const result = await sendDanmaku(account.key, roomId, content, dmType).catch(
        (err: unknown) => ({
          ok: false,
          message: err instanceof Error ? err.message : String(err)
        })
      )
      this.app.logger.log(
        result.ok
          ? `[${account.nickname}] 成功向房间 ${roomId} 发送弹幕`
          : `[${account.nickname}] 发送失败: ${result.message}`
      )
    }

    if (concurrent) {
      await mapLimit(accounts, CONCURRENCY, send)
      return
    }

    // Sequential mode spaces the accounts out; concurrent mode does not.
    for (const account of accounts) {
      await send(account)
      await sleep(TIMING.sequentialDanmakuGap)
    }
  }

  /** Fire likes from many accounts in parallel, recording each success. */
  async sendLikes(
    roomId: string,
    clickTime: number,
    accounts: Array<{ key: string; nickname: string }>
  ): Promise<void> {
    await mapLimit(accounts, CONCURRENCY, async (account) => {
      try {
        const result = await likeRoom(account.key, roomId, clickTime)
        if (result.ok) {
          this.app.logger.log(
            `[${account.nickname}] 直播间 ${roomId} 点赞完成 (click_time=${clickTime})`
          )
          this.app.recordLikeCount(roomId, account.key, clickTime)
        } else {
          this.app.logger.log(`[${account.nickname}] 直播间 ${roomId} 点赞失败: ${result.message}`)
        }
      } catch (err) {
        this.app.logger.log(
          `[${account.nickname}] 直播间 ${roomId} 点赞异常: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    })
  }
}
