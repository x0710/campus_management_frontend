/**
 * 导入进度、请求日志与取消处理。
 *
 * 进度不是按「完成几个人」推进，而是启动前预估总请求数，每发出并结束一个请求推进一格；
 * 每个请求都会通过 onLog 输出一条记录（阶段、方法、路径、条数、结果）。
 */
import axios from 'axios'
import { extractErrorReason } from '../../api/common'
import type { ImportTelemetry, MemberImportRequestLog, RequestMeta } from './types'

/** 批量查询接口单次最多提交的 UID 数量（避免 URL 过长、超出后端单批上限） */
export const EXISTING_LOOKUP_BATCH_SIZE = 100

/** 取消导入时抛出的内部异常（不当作写库失败处理） */
class ImportAbortedError extends Error {
  constructor() {
    super('import aborted')
    this.name = 'ImportAbortedError'
  }
}

/**
 * 该异常是否代表用户主动取消。
 * @param err 捕获到的异常（必填）
 * @returns boolean 是否属于取消
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof ImportAbortedError || (axios.isAxiosError(err) && axios.isCancel(err))
}

/**
 * 已取消时抛异常，用于在请求之间快速退出。
 * @param signal 取消信号（可选）
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImportAbortedError()
}

/**
 * 推送当前进度（total 不小于 done，避免出现 >100%）。
 * @param state 进度记录器（必填）
 */
export function emitProgress(state: ImportTelemetry): void {
  state.onProgress?.(state.done, Math.max(state.done, state.total))
}

/**
 * 设置预估总请求数（导入开始前调用一次）。
 * @param state 进度记录器（必填）
 * @param total 预估的总请求数（必填）
 */
export function initTotal(state: ImportTelemetry, total: number): void {
  state.total = total
  emitProgress(state)
}

/**
 * 进入一个分片：记录该分片预估会发出的请求数。
 * @param state 进度记录器（必填）
 * @param planned 该分片预估值（必填）
 */
export function beginChunk(state: ImportTelemetry, planned: number): void {
  state.chunkPlanned = planned
  state.chunkExecuted = 0
}

/**
 * 结束一个分片：把预估中没真正发出的请求从总数里扣掉，并推送一次进度。
 * @param state 进度记录器（必填）
 */
export function endChunk(state: ImportTelemetry): void {
  state.total -= Math.max(0, state.chunkPlanned - state.chunkExecuted)
  state.chunkPlanned = 0
  state.chunkExecuted = 0
  emitProgress(state)
}

/**
 * 记录一次请求（同时推进进度）。
 * @param state 进度记录器（必填）
 * @param meta 请求元信息（必填）
 * @param status 请求结果（必填）
 * @param message 失败原因（可选）
 */
function recordRequest(
  state: ImportTelemetry,
  meta: RequestMeta,
  status: MemberImportRequestLog['status'],
  message?: string,
): void {
  state.done += 1
  state.chunkExecuted += 1
  state.seq += 1
  state.onLog?.({
    seq: state.seq,
    at: new Date().toLocaleTimeString(),
    phaseKey: meta.phaseKey,
    method: meta.method,
    path: meta.path,
    count: meta.count,
    status,
    ...(message ? { message } : {}),
  })
  emitProgress(state)
}

/**
 * 执行一个会被计入进度与日志的请求；取消时记录一条 aborted 并抛出中断异常。
 * @param state 进度记录器（必填）
 * @param meta 请求元信息（必填）
 * @param send 真正的请求调用（必填）
 * @returns Promise<T> 请求返回值
 */
export async function runRequest<T>(
  state: ImportTelemetry,
  meta: RequestMeta,
  send: () => Promise<T>,
): Promise<T> {
  throwIfAborted(state.signal)
  try {
    const result = await send()
    recordRequest(state, meta, 'success')
    return result
  } catch (err) {
    if (isAbortError(err)) {
      recordRequest(state, meta, 'aborted')
      throw new ImportAbortedError()
    }
    recordRequest(state, meta, 'failed', extractErrorReason(err, state.t))
    throw err
  }
}
