/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving order.
 * Replaces the `ThreadPoolExecutor(max_workers=...)` pattern from the Python
 * version, which spawned one thread per account.
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
