/**
 * 统一的错误反馈 hook（可复用，代码要求 1、9）。
 *
 * 背景：项目内各页面普遍各写一个局部 showError，把接口异常转成 message.error，
 * 但取值口径不一（各页自行拼接错误文案，状态码与中文原因常有缺失），
 * 导致同一类错误在不同页面提示不一致。本 hook 统一收敛为 extractErrorReason——
 * 输出「HTTP 状态码 + 中文原因 + 后端原文」，符合代码要求 9 的错误提示口径。
 *
 * 用法（用于表单提交、删除、审批等操作失败的 toast 提示）：
 *   const reportError = useErrorFeedback()
 *   try { await submit() } catch (err) { reportError(err) }
 *
 * 说明：401 由 http 拦截器统一处理登录态，调用方通常已自行跳过，本 hook 不特殊处理。
 *       仅用于「异常对象 → 提示」的场景；纯校验类提示（如「请填写必填项」）仍直接调用 message.error。
 */
import { App as AntdApp } from 'antd'
import { useCallback } from 'react'
import { extractErrorReason } from '../api/common'
import { useT } from '../i18n'

/**
 * 返回一个错误反馈函数：把捕获到的异常转成带状态码与中文原因的 message.error 提示。
 *
 * @returns (err: unknown) => void —— 建议命名 reportError 使用
 */
export function useErrorFeedback(): (err: unknown) => void {
  const { message } = AntdApp.useApp()
  const t = useT()
  return useCallback(
    (err: unknown) => {
      message.error(extractErrorReason(err, t))
    },
    [message, t],
  )
}
