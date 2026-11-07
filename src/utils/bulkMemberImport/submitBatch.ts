/**
 * 批量请求的提交与失败定位：先按 1000 条一批，失败后按 100 → 10 → 1 降级，
 * 把失败原因定位到具体行。
 */
import { extractErrorReason } from '../../api/common'
import { sendInTiers } from './batching'
import { addWarning } from './payloads'
import type { ImportTelemetry, RequestMeta } from './types'

/**
 * 批量提交一个分片的写入；整批失败且错误可能是批次大小 / 单项问题时，按阶梯拆分重试，
 * 最终把失败原因落到具体行。
 * @param params.state 进度记录器（必填）
 * @param params.meta 请求元信息（必填，count 由调用处按 payloads 长度覆盖）
 * @param params.rows 每项对应的 Excel 行号（必填）
 * @param params.payloads 批量请求元素（必填）
 * @param params.batch 批量接口调用（必填）
 * @param params.single 单项接口调用，用于降级到 1 条时重试（必填）
 * @param params.warningsByRow 行号 → 失败原因列表（必填）
 * @param params.messageKey 失败提示的 i18n key（必填）
 */
export async function submitBatch<P>(params: {
  state: ImportTelemetry
  meta: RequestMeta
  rows: number[]
  payloads: P[]
  batch: (payloads: P[]) => Promise<unknown>
  single: (payload: P) => Promise<unknown>
  warningsByRow: Map<number, string[]>
  messageKey: string
}): Promise<void> {
  const { state, rows, payloads, warningsByRow } = params
  if (payloads.length === 0) return

  const { errors } = await sendInTiers({
    state,
    meta: params.meta,
    payloads,
    batch: params.batch,
    single: params.single,
  })

  for (const [index, err] of errors) {
    addWarning(
      warningsByRow,
      rows[index],
      state.t(params.messageKey, { reason: extractErrorReason(err, state.t) }),
    )
  }
}
