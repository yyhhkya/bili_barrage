import { randomInt } from 'node:crypto'

const UPPER_ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** 37-char random token, matching `random.choices(ascii_uppercase + digits, k=37)`. */
export function randomBuvid(length = 37): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += UPPER_ALNUM[randomInt(UPPER_ALNUM.length)]
  }
  return out
}
