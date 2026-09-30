/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving order.
 *
 * Every multi-account action (send, like, watch) fans out through this, so one
 * slow or hanging account cannot stall the rest, and a long account list cannot
 * open hundreds of sockets at once.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  if (items.length === 0) return results

  const width = Math.max(1, Math.min(limit, items.length))
  let cursor = 0

  const workers = Array.from({ length: width }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
