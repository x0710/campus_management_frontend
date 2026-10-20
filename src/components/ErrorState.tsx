/**
 * 统一的内联错误提示（可复用组件，代码要求 1、9）。
 *
 * 背景：项目内「错误 Alert + 可选重试按钮」的写法在 30+ 个页面重复出现，
 * 形状基本一致（type="error"、showIcon、title=错误文案、action=重试按钮），
 * 因此抽出本组件统一渲染，避免各页各写一遍、样式与文案口径漂移。
 *
 * 用法：
 *   <ErrorState message={error} onRetry={() => void load(true)} />
 *   <ErrorState message={error} description={detail} style={{ marginBottom: 12 }} />
 *
 * 文案约定：message 建议由 api/common.ts 的 extractErrorReason 生成，
 * 已包含 HTTP 状态码与中文原因（代码要求 9）；本组件只负责展示，不做文案转换。
 */
import { Alert, Button } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { useT } from '../i18n'

interface ErrorStateProps {
  /** 主错误文案（必填；建议由 extractErrorReason 生成，已含状态码与中文原因） */
  message: string
  /** 次级说明（可选；例如后端返回的原始文本，展示在文案下方） */
  description?: ReactNode
  /** 恢复动作回调（可选；提供时展示按钮，通常是「重试」） */
  onRetry?: () => void
  /** 按钮文案（可选；默认「重试」，非重试类恢复动作可覆盖，如「返回列表」） */
  retryText?: string
  /** 透传样式（可选；如弹窗/表格内需要 marginBottom） */
  style?: CSSProperties
  /** 透传类名（可选；如登录页的 login-alert） */
  className?: string
}

/** 统一错误提示：错误 Alert（含图标）+ 可选恢复按钮 */
export default function ErrorState({
  message,
  description,
  onRetry,
  retryText,
  style,
  className,
}: ErrorStateProps) {
  const t = useT()
  return (
    <Alert
      type="error"
      showIcon
      title={message}
      description={description}
      className={className}
      style={style}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            {retryText ?? t('common.retry')}
          </Button>
        ) : undefined
      }
    />
  )
}
