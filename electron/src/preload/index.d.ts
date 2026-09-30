import type { BiliApi } from './index'

declare global {
  interface Window {
    api: BiliApi
  }
}

export {}
