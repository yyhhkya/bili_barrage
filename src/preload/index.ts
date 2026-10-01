import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppState,
  Emoticon,
  EmoticonGroup,
  IpcResult,
  LikeCountTotal,
  LoginPollResult,
  PushEvents,
  Task,
  UpdateInfo,
  UpdateProgress,
  WatchEntry,
  WindowState
} from '../shared/types'

/**
 * Unwraps the `IpcResult` envelope, turning `{ok:false}` back into a rejection
 * so renderer code can use plain try/catch and `useQuery`-style helpers.
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

/** Subscribe to a push channel; returns an unsubscribe function. */
function subscribe<K extends keyof PushEvents>(
  channel: K,
  listener: (payload: PushEvents[K]) => void
): () => void {
  const handler = (_event: unknown, payload: PushEvents[K]): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  // state
  getState: () => invoke<AppState>('api:getState'),
  getLogHistory: () => invoke<string[]>('api:getLogHistory'),
  clearLogs: () => invoke<boolean>('api:clearLogs'),

  // accounts
  addAccount: (nickname: string, key: string) =>
    invoke<boolean>('api:addAccount', nickname, key),
  editAccount: (index: number, nickname: string, key: string) =>
    invoke<boolean>('api:editAccount', index, nickname, key),
  deleteAccount: (index: number) => invoke<boolean>('api:deleteAccount', index),
  getNickname: (accessKey: string) => invoke<string | null>('api:getNickname', accessKey),

  // QR login
  startScanLogin: () => invoke<string | null>('api:startScanLogin'),
  pollLogin: () => invoke<LoginPollResult>('api:pollLogin'),
  cancelLogin: () => invoke<boolean>('api:cancelLogin'),

  // legacy import
  importLegacyConfig: () =>
    invoke<{ imported: boolean; accounts: number; tasks: number }>('api:importLegacyConfig'),

  // danmaku
  sendDanmaku: (
    roomId: string,
    content: string,
    indices: number[],
    dmType = 0,
    concurrent = false
  ) => invoke<boolean>('api:sendDanmaku', roomId, content, indices, dmType, concurrent),

  // likes
  sendLikes: (roomId: string, clickTime: number, indices: number[]) =>
    invoke<boolean>('api:sendLikes', roomId, clickTime, indices),
  getLikeCounts: (roomId: string) =>
    invoke<Record<string, number>>('api:getLikeCounts', roomId),
  getLikeCountsTotal: () => invoke<LikeCountTotal[]>('api:getLikeCountsTotal'),

  // emoticons
  getEmoticons: (accountIndex: number, roomId: string) =>
    invoke<EmoticonGroup[]>('api:getEmoticons', accountIndex, roomId),
  loadEmojiGroup: (groupIndex: number) => invoke<Emoticon[]>('api:loadEmojiGroup', groupIndex),

  // tasks
  addTask: (task: Partial<Task>, indices: number[]) =>
    invoke<boolean>('api:addTask', task, indices),
  editTask: (index: number, task: Partial<Task>, indices: number[]) =>
    invoke<boolean>('api:editTask', index, task, indices),
  deleteTask: (index: number) => invoke<boolean>('api:deleteTask', index),
  startTask: (index: number) => invoke<boolean>('api:startTask', index),
  stopTask: (index: number) => invoke<boolean>('api:stopTask', index),

  // watch
  getWatchStatus: () => invoke<WatchEntry[]>('api:getWatchStatus'),
  startWatch: (roomId: string, indices: number[]) =>
    invoke<boolean>('api:startWatch', roomId, indices),
  stopWatch: (roomId: string, indices: number[]) =>
    invoke<boolean>('api:stopWatch', roomId, indices),

  // update
  checkUpdate: () => invoke<UpdateInfo>('api:checkUpdate'),
  downloadUpdate: () => invoke<boolean>('api:downloadUpdate'),
  quitAndInstall: () => invoke<boolean>('api:quitAndInstall'),
  getUpdateProgress: () => invoke<UpdateProgress>('api:getUpdateProgress'),
  openExternal: (url: string) => invoke<boolean>('api:openExternal', url),

  // misc
  getPaths: () =>
    invoke<{ userData: string; config: string; logs: string }>('api:getPaths'),
  openPath: (target: string) => invoke<boolean>('api:openPath', target),

  // frameless window chrome
  windowMinimize: () => invoke<boolean>('api:windowMinimize'),
  windowToggleMaximize: () => invoke<boolean>('api:windowToggleMaximize'),
  windowClose: () => invoke<boolean>('api:windowClose'),
  windowIsMaximized: () => invoke<boolean>('api:windowIsMaximized'),

  // push subscriptions
  onStateChanged: (l: (s: AppState) => void) => subscribe('state:changed', l),
  onWatchChanged: (l: (w: WatchEntry[]) => void) => subscribe('watch:changed', l),
  onLogLine: (l: (line: string) => void) => subscribe('log:line', l),
  onUpdateProgress: (l: (p: UpdateProgress) => void) => subscribe('update:progress', l),
  onWindowState: (l: (s: WindowState) => void) => subscribe('window:state', l)
}

export type BiliApi = typeof api

contextBridge.exposeInMainWorld('api', api)

export type { Account, Task }
