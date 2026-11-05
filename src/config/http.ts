/**
 * HTTP 错误处理相关常量（代码要求 7：常量统一收敛到 config/）。
 */

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
  500: 'common.errServerError',
}
