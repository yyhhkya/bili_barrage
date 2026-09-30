import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import QRCode from 'qrcode'
import type { Emoticon, EmoticonGroup } from '../../shared/types'
import { fetchEmoticons, type RawEmoticonGroup } from '../bili/endpoints'
import { fetchBinary } from '../bili/http'
import { mapLimit } from './concurrency'
import type { Logger } from './logger'

const IMAGE_CONCURRENCY = 10
const MEMORY_TTL = 30 * 60_000

interface CacheEntry {
  dataUrl: string
  at: number
}

/**
 * Fetches emoticon packages and inlines every image as a data URL.
 *
 * The Python version re-downloaded images on every panel open. Here they are
 * cached on disk under `<userData>/emoji-cache/<sha1>`, so repeat opens are
 * free. No image-processing dependency is introduced: bytes go straight to a
 * data URL, which is what the renderer needs anyway.
 */
export class EmoticonService {
  private readonly cacheDir: string
  private readonly memory = new Map<string, CacheEntry>()
  private groups: RawEmoticonGroup[] = []
  private loadedGroups = new Map<number, Emoticon[]>()

  constructor(
    userDataDir: string,
    private readonly logger: Logger
  ) {
    this.cacheDir = path.join(userDataDir, 'emoji-cache')
  }

  /** Fetch the package list for one account, with covers inlined. */
  async load(accessKey: string, roomId: string): Promise<EmoticonGroup[]> {
    if (!roomId) return []

    const raw = await fetchEmoticons(accessKey, roomId).catch(() => [] as RawEmoticonGroup[])
    this.groups = raw
    this.loadedGroups.clear()

    const total = raw.reduce((n, g) => n + g.emoticons.length, 0)
    this.logger.log(`获取到 ${total} 个表情，${raw.length} 个分组`)

    const covers = await mapLimit(raw, IMAGE_CONCURRENCY, (g) => this.inline(g.cover))

    return raw.map((g, i) => ({
      name: g.name,
      cover: covers[i],
      // Image URLs are omitted here; they arrive via loadGroup on tab open.
      emoticons: g.emoticons.map((e) => ({ emoji: e.emoji, url: '', descript: e.descript }))
    }))
  }

  /** Inline one group's images. Called lazily when its tab is opened. */
  async loadGroup(groupIndex: number): Promise<Emoticon[]> {
    const cached = this.loadedGroups.get(groupIndex)
    if (cached) return cached

    const group = this.groups[groupIndex]
    if (!group) return []

    const urls = await mapLimit(group.emoticons, IMAGE_CONCURRENCY, (e) => this.inline(e.url))
    const result = group.emoticons.map((e, i) => ({
      emoji: e.emoji,
      url: urls[i],
      descript: e.descript
    }))

    this.loadedGroups.set(groupIndex, result)
    return result
  }

  /** Resolve a remote image to a data URL, trying the disk cache first. */
  private async inline(url: string): Promise<string> {
    if (!url || url.startsWith('data:')) return url

    const hit = this.memory.get(url)
    if (hit && Date.now() - hit.at < MEMORY_TTL) return hit.dataUrl

    const file = path.join(this.cacheDir, createHash('sha1').update(url).digest('hex'))

    try {
      const buf = await fs.readFile(file)
      const dataUrl = toDataUrl(buf)
      this.memory.set(url, { dataUrl, at: Date.now() })
      return dataUrl
    } catch {
      // Not cached yet.
    }

    const buf = await fetchBinary(url, 5000)
    if (!buf) return url

    const dataUrl = toDataUrl(buf)
    this.memory.set(url, { dataUrl, at: Date.now() })

    try {
      await fs.mkdir(this.cacheDir, { recursive: true })
      await fs.writeFile(file, buf)
    } catch {
      // Cache write is best-effort.
    }

    return dataUrl
  }
}

function toDataUrl(buf: Buffer): string {
  return `data:${sniffMime(buf)};base64,${buf.toString('base64')}`
}

/** Bilibili serves png/webp/gif/jpg interchangeably; sniff so the renderer gets it right. */
function sniffMime(buf: Buffer): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.length >= 6 && buf.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif'
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  return 'image/png'
}

/**
 * Renders the login URL to a PNG data URL.
 *
 * The Python version used `qrcode` + PIL. `qrcode` still does the encoding;
 * rendering goes through its own buffer API, so no image library is needed.
 */
export async function renderQrCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 400,
    color: { dark: '#18181bff', light: '#ffffffff' }
  })
}
