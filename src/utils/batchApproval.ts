/** 顺序处理审批：保留逐条结果，过期后不再提交下一项。调用方仅传入未成功项。 */
export async function runBatchApproval<T>(
  items: readonly T[],
  submit: (item: T) => Promise<void>,
  isCurrent: () => boolean,
  onResult: (item: T, result: { success: true } | { success: false; error: unknown }) => void,
): Promise<void> {
  for (const item of items) {
    if (!isCurrent()) break
    try {
      await submit(item)
      if (isCurrent()) onResult(item, { success: true })
    } catch (error) {
      if (isCurrent()) onResult(item, { success: false, error })
    }
  }
}
