/**
 * HTTP 错误处理相关常量（代码要求 7：常量统一收敛到 config/）。
 */

/**
 * 批量导入等长耗时写请求的超时时间（毫秒）。
 * 全局 axios 超时是 15 秒（普通页面请求保持快速失败）；批量建号 / 批量写任职 / 档案等
 * 在数据量大或数据库繁忙时可能超过 15 秒，单独放宽到 60 秒，并仍可通过 AbortSignal 取消。
 */
export const BATCH_REQUEST_TIMEOUT_MS = 60_000

/**
 * HTTP 状态码 → 中文原因说明的 i18n key 映射。
 * 用于报错时用中文写明原因，避免直接把后端英文/数据库原文抛给用户。
 */
export const HTTP_STATUS_REASON_KEYS: Record<number, string> = {
  400: 'common.errBadRequest',
  401: 'common.errUnauthorized',
  403: 'common.errForbidden',
  404: 'common.errNotFound',
  409: 'common.errConflict',
  412: 'common.errPreconditionFailed',
  413: 'common.errPayloadTooLarge',
  414: 'common.errUriTooLong',
  431: 'common.errRequestHeaderTooLarge',
  500: 'common.errServerError',
}
