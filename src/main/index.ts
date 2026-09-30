import { app, shell, BrowserWindow } from 'electron'
import path from 'node:path'
import { AppCore } from './core/app'
import { registerIpc } from './ipc'

let core: AppCore | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    // Frameless: the renderer draws the whole title bar, including the
    // minimise/maximise/close buttons.
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#fffbf2',
    title: 'B站弹幕助手',
    // Taskbar / Alt-Tab icon. electron-builder stamps the exe itself from
    // resources/icon.ico; this covers the unpackaged dev run.
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // The renderer's maximise button needs to know the real state, which can also
  // change via snap layouts / Win+Up / double-clicking the drag region.
  const pushWindowState = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('window:state', {
      maximized: mainWindow.isMaximized(),
      fullscreen: mainWindow.isFullScreen()
    })
  }
  mainWindow.on('maximize', pushWindowState)
  mainWindow.on('unmaximize', pushWindowState)
  mainWindow.on('enter-full-screen', pushWindowState)
  mainWindow.on('leave-full-screen', pushWindowState)

  // External links open in the system browser, never in an app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block in-app navigation away from the bundled renderer.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env['ELECTRON_RENDERER_URL']
    if (devServer && url.startsWith(devServer)) return
    event.preventDefault()
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
  })

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) {
    void mainWindow.loadURL(devServer)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// A second instance would fight over config.json and the log file.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    const userDataDir = app.getPath('userData')

    core = new AppCore(userDataDir, app.getVersion())
    registerIpc(core, userDataDir)

    createWindow()

    // Restore tasks that were running when the app last exited.
    await core.taskRunner.resumePersisted()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Close sockets and cancel every timer before the process goes away, so the
// presence sessions end cleanly rather than being killed mid-heartbeat.
app.on('before-quit', () => {
  core?.shutdown()
})
