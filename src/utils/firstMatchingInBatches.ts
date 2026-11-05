/** 限制请求并发，按输入顺序选择首个匹配项；取消后不再发起下一批。 */
export async function firstMatchingInBatches<T>(
  items: readonly T[],
  matches: (item: T) => Promise<boolean>,
  batchSize = 4,
  cancelled: () => boolean = () => false,
): Promise<T | undefined> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('Invalid batch size')
  for (let start = 0; start < items.length && !cancelled(); start += batchSize) {
    const batch = items.slice(start, start + batchSize)
    const results = await Promise.all(batch.map(matches))
    if (cancelled()) return undefined
    const index = results.indexOf(true)
    if (index >= 0) return batch[index]
  }
}
