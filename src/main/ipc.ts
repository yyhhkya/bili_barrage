import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { IpcResult, PushEvents } from '../shared/types'
import type { AppCore } from './core/app'
import { EmoticonService } from './core/emoticons'
import { QrLogin } from './core/qrlogin'
import { Updater } from './updater'
import { fetchNickname } from './bili/endpoints'
import { readLegacyConfig } from './core/config'

/** Push one event to every open renderer. */
function broadcast<K extends keyof PushEvents>(channel: K, payload: PushEvents[K]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/**
 * Wraps a handler so the renderer always receives an `IpcResult` instead of an
 * exception crossing the bridge. Without this an exception is swallowed by the
 * bridge and the renderer sees an opaque null, which is impossible to debug.
 */
function handle<A extends unknown[], R>(
  channel: string,
  fn: (...args: A) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<R>> => {
    try {
      return { ok: true, data: await fn(...(args as A)) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

export function registerIpc(app: AppCore, userDataDir: string): void {
  const emoticons = new EmoticonService(userDataDir, app.logger)
  const qrLogin = new QrLogin(app.logger)
  const updater = new Updater(app.logger)

  // ------------------------------------------------------- window chrome
  // The window is frameless, so these replace the OS title bar buttons.
  handle('api:windowMinimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
    return true
  })
  handle('api:windowToggleMaximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  handle('api:windowClose', () => {
    BrowserWindow.getFocusedWindow()?.close()
    return true
  })
  handle('api:windowIsMaximized', () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false)

  // Outbound pushes, replacing the renderer's polling timers.
  app.on('state:changed', (s) => broadcast('state:changed', s))
  app.on('watch:changed', (w) => broadcast('watch:changed', w))
  app.on('log:line', (l) => broadcast('log:line', l))
  updater.on('progress', (p) => broadcast('update:progress', p))

  // ------------------------------------------------------------- state
  handle('api:getState', () => app.getState())
  handle('api:getLogHistory', () => app.logger.history())
  handle('api:clearLogs', () => {
    app.logger.clear()
    return true
  })

  // ---------------------------------------------------------- accounts
  handle('api:addAccount', (nickname: string, key: string) => {
    app.addAccount(nickname, key)
    return true
  })
  handle('api:editAccount', (index: number, nickname: string, key: string) => {
    app.editAccount(index, nickname, key)
    return true
  })
  handle('api:deleteAccount', (index: number) => {
    app.deleteAccount(index)
    return true
  })
  handle('api:getNickname', (accessKey: string) => fetchNickname(accessKey))

  // --------------------------------------------------------- QR login
  handle('api:startScanLogin', () => qrLogin.start())
  handle('api:pollLogin', () => qrLogin.poll())
  handle('api:cancelLogin', () => {
    qrLogin.cancel()
    return true
  })

  // ------------------------------------------------------------ legacy
  /** Carry accounts and tasks over from a config.json of an earlier build. */
  handle('api:importLegacyConfig', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 config.json',
      properties: ['openFile'],
      filters: [{ name: '配置文件', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths.length) {
      return { imported: false, accounts: 0, tasks: 0 }
    }

    const legacy = readLegacyConfig(result.filePaths[0])
    if (!legacy.accounts.length && !legacy.tasks.length) {
      return { imported: false, accounts: 0, tasks: 0 }
    }

    // Merge by access key so a repeat import does not duplicate accounts.
    const existing = new Set(app.accounts.map((a) => a.key))
    const added = legacy.accounts.filter((a) => !existing.has(a.key))
    app.accounts.push(...added)

    const existingRoomIds = new Set(app.tasks.map((t) => `${t.room_id}|${t.content}`))
    const newTasks = legacy.tasks.filter((t) => !existingRoomIds.has(`${t.room_id}|${t.content}`))
    for (const t of newTasks) {
      t.id = app.tasks.length + 1
      app.tasks.push(t)
    }

    app.saveConfig()
    app.logger.log(`导入配置: ${added.length} 个账号, ${newTasks.length} 个任务`)
    app.emitState()

    return { imported: true, accounts: added.length, tasks: newTasks.length }
  })

  // ----------------------------------------------------------- danmaku
  handle(
    'api:sendDanmaku',
    async (roomId: string, content: string, indices: number[], dmType: number, concurrent: boolean) => {
      const targets = app.selectAccounts(indices.map(Number))
      await app.taskRunner.sendToAccounts(roomId, content, targets, dmType ?? 0, Boolean(concurrent))
      return true
    }
  )

  // ------------------------------------------------------------- likes
  handle('api:sendLikes', async (roomId: string, clickTime: number, indices: number[]) => {
    const targets = app.selectAccounts(indices)
    await app.taskRunner.sendLikes(roomId, clickTime, targets)
    return true
  })
  handle('api:getLikeCounts', (roomId: string) => app.getLikeCounts(roomId))
  handle('api:getLikeCountsTotal', () => app.getLikeCountsTotal())

  // ---------------------------------------------------------- emoticons
  handle('api:getEmoticons', async (accountIndex: number, roomId: string) => {
    const account = app.accounts[accountIndex]
    if (!account) return []
    return emoticons.load(account.key, roomId)
  })
  handle('api:loadEmojiGroup', (groupIndex: number) => emoticons.loadGroup(groupIndex))

  // ------------------------------------------------------------- tasks
  handle('api:addTask', (task: Record<string, unknown>, indices: number[]) => {
    const selected = app.selectAccounts(indices)
    app.tasks.push({
      id: app.tasks.length + 1,
      room_id: String(task.room_id ?? ''),
      room_remark: String(task.room_remark ?? ''),
      content: String(task.content ?? ''),
      accounts: selected.map((a) => a.nickname),
      account_keys: selected.map((a) => a.key),
      interval: Number(task.interval) || 5,
      status: '停止',
      current_content_index: 0
    })
    app.saveConfig()
    app.logger.log(`添加定时任务: 房间 ${task.room_id}, 间隔 ${task.interval} 分钟`)
    app.emitState()
    return true
  })

  handle('api:editTask', (index: number, task: Record<string, unknown>, indices: number[]) => {
    const existing = app.tasks[index]
    if (!existing) return false
    void app.taskRunner.stop(existing)

    const selected = app.selectAccounts(indices)
    existing.room_id = String(task.room_id ?? '')
    existing.room_remark = String(task.room_remark ?? '')
    existing.content = String(task.content ?? '')
    existing.interval = Number(task.interval) || 5
    existing.accounts = selected.map((a) => a.nickname)
    existing.account_keys = selected.map((a) => a.key)
    existing.status = '停止'
    existing.current_content_index = 0
    app.saveConfig()
    app.logger.log(`编辑定时任务: 房间 ${task.room_id}, 间隔 ${task.interval} 分钟`)
    app.emitState()
    return true
  })

  handle('api:deleteTask', async (index: number) => {
    const task = app.tasks[index]
    if (!task) return false
    await app.taskRunner.stop(task)
    const roomId = task.room_id
    app.tasks.splice(index, 1)
    app.saveConfig()
    app.logger.log(`删除定时任务: 房间 ${roomId}`)
    app.emitState()
    return true
  })

  handle('api:startTask', (index: number) => {
    const task = app.tasks[index]
    if (!task || task.status === '运行中') return false
    void app.taskRunner.start(task)
    return true
  })

  handle('api:stopTask', (index: number) => {
    const task = app.tasks[index]
    if (!task || task.status === '停止') return false
    void app.taskRunner.stop(task)
    return true
  })

  // ------------------------------------------------------------- watch
  handle('api:getWatchStatus', () => app.watchManager.getStatus())
  handle('api:startWatch', async (roomId: string, indices: number[]) => {
    const targets = app.selectAccounts(indices)
    await app.watchManager.startMany(roomId, targets)
    return true
  })
  handle('api:stopWatch', async (roomId: string, indices: number[]) => {
    const targets = app.selectAccounts(indices)
    await app.watchManager.stopMany(roomId, targets)
    return true
  })

  // ------------------------------------------------------------ update
  handle('api:checkUpdate', () => updater.check())
  handle('api:downloadUpdate', async () => {
    await updater.download()
    return true
  })
  handle('api:quitAndInstall', () => {
    updater.quitAndInstall()
    return true
  })
  handle('api:getUpdateProgress', () => updater.getProgress())
  handle('api:openExternal', async (url: string) => {
    // Only allow https to keep a compromised renderer from launching arbitrary URLs.
    if (!/^https:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  })

  // -------------------------------------------------------------- misc
  handle('api:getPaths', () => ({
    userData: userDataDir,
    config: app.configPath,
    logs: path.join(userDataDir, 'logs')
  }))
  handle('api:openPath', async (target: string) => {
    // Confine to the app's own data directory.
    const resolved = path.resolve(target)
    if (!resolved.startsWith(path.resolve(userDataDir))) return false
    if (fs.existsSync(resolved)) {
      await shell.openPath(resolved)
      return true
    }
    return false
  })
}
