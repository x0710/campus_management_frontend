/**
 * 批量写入的分片与自适应降级。
 *
 * 先按 1000 条一批发送；失败且错误可能由批次大小或单项数据引起时，
 * 依次降级为 100 → 10 → 1 条重试，把失败范围缩到最小。
 */
import { BULK_WRITE_BATCH_TIERS } from '../../config/bulkMembers'
import { canRetryPerItem } from './payloads'
import { isAbortError, runRequest } from './telemetry'
import type { ImportTelemetry, RequestMeta } from './types'

/**
 * 把数组切成固定大小的块。
 * @param items 原数组（必填）
 * @param size 每块最大条数（必填，必须大于 0）
 * @returns 分块后的数组
 */
export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive')
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

/** 自适应批量写入的结果：失败项下标 → 最终错误 */
export interface TieredBatchResult {
  errors: Map<number, unknown>
}

/** 自适应批量写入参数 */
export interface TieredBatchParams<P> {
  state: ImportTelemetry
  meta: RequestMeta
  payloads: P[]
  batch: (payloads: P[]) => Promise<unknown>
  /** 单项接口；降级到 1 条时优先使用，未提供则继续调用 batch */
  single?: (payload: P) => Promise<unknown>
  /** 单条写入成功后的回调（用于记录已创建的行） */
  onItemSuccess?: (payload: P, index: number) => void
}

/**
 * 按 1000 → 100 → 10 → 1 的阶梯写入；只对「可能是批次大小 / 单项数据」的错误降级，
 * 401 / 403 / 500 等整批问题不拆分，避免无意义地放请求。
 * @param params 批量写入参数（必填）
 * @returns 失败项下标与最终错误；空 Map 表示全部成功
 */
export async function sendInTiers<P>(
  params: TieredBatchParams<P>,
): Promise<TieredBatchResult> {
  const { state, meta, payloads, batch, single, onItemSuccess } = params
  const errors = new Map<number, unknown>()
  if (payloads.length === 0) return { errors }

  const lastTier = BULK_WRITE_BATCH_TIERS.length - 1
  const indexed = payloads.map((payload, index) => ({ payload, index }))
  const initialGroups = chunkItems(indexed, BULK_WRITE_BATCH_TIERS[0])
  // 启动前只按「每个阶段一个请求」预估；初始拆分多出来的请求补进进度分母
  if (initialGroups.length > 1) state.total += initialGroups.length - 1
  for (const group of initialGroups) await attempt(0, group)
  return { errors }

  /**
   * 尝试一个批次；失败时按阶梯拆分。
   * @param tierIndex 当前档位下标（必填）
   * @param group 当前批次及原始下标（必填）
   */
  async function attempt(
    tierIndex: number,
    group: { payload: P; index: number }[],
  ): Promise<void> {
    if (group.length === 0) return
    const singleSend =
      group.length === 1 && tierIndex === lastTier && single !== undefined
        ? single
        : undefined
    try {
      await runRequest(state, { ...meta, count: group.length }, () =>
        singleSend
          ? singleSend(group[0].payload)
          : batch(group.map((item) => item.payload)),
      )
      for (const item of group) onItemSuccess?.(item.payload, item.index)
      return
    } catch (err) {
      if (isAbortError(err)) throw err

      // 单项批次失败：如果还没试过 single 接口，最后单独再试一次（保持原逐项重试行为）
      if (group.length === 1 && singleSend === undefined && single !== undefined) {
        state.total += 1
        try {
          await runRequest(state, { ...meta, count: 1 }, () => single(group[0].payload))
          onItemSuccess?.(group[0].payload, group[0].index)
          return
        } catch (singleError) {
          if (isAbortError(singleError)) throw singleError
          errors.set(group[0].index, singleError)
          return
        }
      }

      if (!canRetryPerItem(err)) {
        for (const item of group) errors.set(item.index, err)
        return
      }

      // 找下一个严格小于当前批量的档位；找不到说明已经到 1 条，记录失败
      let nextTier = tierIndex + 1
      while (nextTier <= lastTier && BULK_WRITE_BATCH_TIERS[nextTier] >= group.length) {
        nextTier += 1
      }
      if (nextTier > lastTier) {
        for (const item of group) errors.set(item.index, err)
        return
      }

      const subGroups = chunkItems(group, BULK_WRITE_BATCH_TIERS[nextTier])
      // 失败的那次请求已经计入进度；拆分出的每个子批次都是额外请求
      state.total += subGroups.length
      for (const subGroup of subGroups) await attempt(nextTier, subGroup)
    }
  }
}
