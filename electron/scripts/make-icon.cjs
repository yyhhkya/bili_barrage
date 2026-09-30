/**
 * Rasterises resources/icon.svg into a multi-resolution resources/icon.ico.
 *
 * Uses Electron itself as the renderer, so the icon comes out of the same
 * engine that draws the UI. That avoids pulling in sharp (native module,
 * rebuild pain on every Electron upgrade) or ImageMagick (an external tool
 * every build machine would then need).
 *
 *   npx electron scripts/make-icon.cjs
 *
 * Sizes follow the Windows convention. 16 and 32 are the ones that matter day
 * to day (taskbar, Alt-Tab, Explorer list view); the large entries are for the
 * installer and the shell's extra-large icon view.
 *
 * Implementation note: ONE window is reused for every size. Creating a fresh
 * BrowserWindow per size made the second load fail with ERR_FAILED, and only
 * the first (16px, created before anything else) ever succeeded.
 */

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const ROOT = path.join(__dirname, '..')
const SVG_PATH = path.join(ROOT, 'resources', 'icon.svg')
const OUT_ICO = path.join(ROOT, 'resources', 'icon.ico')
const OUT_PNG = path.join(ROOT, 'resources', 'icon.png')

/** Builds an ICO container around already-encoded PNG payloads. */
function buildIco(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)

  const entries = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  const payloads = []

  images.forEach((img, i) => {
    const e = 16 * i
    // 256 is encoded as 0: the width/height fields are a single byte each.
    const dim = img.size >= 256 ? 0 : img.size
    entries.writeUInt8(dim, e + 0)
    entries.writeUInt8(dim, e + 1)
    entries.writeUInt8(0, e + 2) // palette count
    entries.writeUInt8(0, e + 3) // reserved
    entries.writeUInt16LE(1, e + 4) // colour planes
    entries.writeUInt16LE(32, e + 6) // bits per pixel
    entries.writeUInt32LE(img.data.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += img.data.length
    payloads.push(img.data)
  })

  return Buffer.concat([header, entries, ...payloads])
}

function htmlFor(svg, size) {
  const bare = svg.replace(/\swidth="\d+"\s+height="\d+"/, '')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${bare}</body></html>`
}

app.whenReady().then(async () => {
  if (!fs.existsSync(SVG_PATH)) {
    console.error(`icon.svg not found at ${SVG_PATH}`)
    app.exit(1)
    return
  }

  const svg = fs.readFileSync(SVG_PATH, 'utf8')
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-icon-'))

  // Largest size first: the window is created once at this size and only ever
  // shrinks, so the SVG is always rasterised at its native resolution rather
  // than an upscale of a smaller render.
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true
  })

  const images = []
  try {
    for (const size of SIZES) {
      win.setContentSize(size, size)
      const file = path.join(scratch, `s${size}.html`)
      fs.writeFileSync(file, htmlFor(svg, size), 'utf8')

      await win.loadFile(file)
      await new Promise((r) => setTimeout(r, 160))

      const image = await win.webContents.capturePage()
      const data = image.toPNG()
      images.push({ size, data })
      console.log(`  ${String(size).padStart(3)}px  ${String(data.length).padStart(6)} bytes`)
    }
  } catch (err) {
    console.error('rasterise failed:', err && err.message)
    app.exit(1)
    return
  } finally {
    win.destroy()
    try {
      fs.rmSync(scratch, { recursive: true, force: true })
    } catch {
      // Best-effort temp cleanup.
    }
  }

  fs.writeFileSync(OUT_ICO, buildIco(images))
  fs.writeFileSync(OUT_PNG, images[images.length - 1].data)

  console.log(`\nwrote ${path.relative(ROOT, OUT_ICO)}  (${fs.statSync(OUT_ICO).size} bytes)`)
  console.log(`wrote ${path.relative(ROOT, OUT_PNG)}  (${fs.statSync(OUT_PNG).size} bytes)`)
  app.exit(0)
})
