/** Map items in input order while limiting simultaneous requests. */
export async function mapInBatches<T, R>(
  items: readonly T[],
  map: (item: T) => Promise<R>,
  batchSize: number,
): Promise<R[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('Invalid batch size')
  const results: R[] = []
  for (let start = 0; start < items.length; start += batchSize) {
    results.push(...await Promise.all(items.slice(start, start + batchSize).map(map)))
  }
  return results
}
