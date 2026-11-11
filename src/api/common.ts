/**
 * 通用工具：从 axios 异常提取可展示的错误文案。
 * 分页相关类型已统一收敛到 types/common.ts，本文件只保留错误处理工具函数。
 */
import axios from 'axios'
import { HTTP_STATUS_REASON_KEYS } from '../config/http'
import type { TranslateFn } from '../i18n'
import { PageLimitError } from '../utils/pagination'

/**
 * 从 axios 异常提取「状态码 + 中文原因 + 后端原文」的可展示文案（代码要求 9：错误提示需含 404、500 等状态码）。
 * 用中文写明失败原因（后端返回的英文/数据库原文仅作补充），常见状态码含义见 HTTP_STATUS_REASON_KEYS。
 * @param err 捕获到的异常（必填）
 * @param t 翻译函数（必填，来自 useT()）
 * @returns string 形如「412 不满足操作前置条件（引用的数据不存在）：Failed to add a child row」；
 *                 无响应返回「无法连接服务器…（后端服务未启动或不可达，ECONNREFUSED）」；
 *                 非 axios 异常返回 t('common.loadFailed')
 */
export function extractErrorReason(err: unknown, t: TranslateFn): string {
  if (err instanceof PageLimitError) return t('common.pageLimit', { limit: err.limit })
  if (!axios.isAxiosError(err)) return t('common.loadFailed')
  const res = err.response
  if (!res) {
    // 无响应：后端未启动（连接被拒绝）、网络不通或请求超时。
    // 附上 axios 错误码（如 ECONNREFUSED、ETIMEDOUT、ERR_NETWORK）便于定位具体原因。
    const code = err.code ? `，${err.code}` : ''
    return `${t('common.networkError')}（${t('common.backendUnreachable')}${code}）`
  }
  const reason = t(HTTP_STATUS_REASON_KEYS[res.status] ?? 'common.errUnknown')
  const detail =
    typeof res.data === 'string' && res.data.trim() ? res.data.trim() : ''
  return detail ? `${res.status} ${reason}：${detail}` : `${res.status} ${reason}`
}
