import type { Notice } from '../api/types/notices'

/** 仅识别后端审批通知的明确编号，不从标题或其他数字猜测目标。 */
export function parseApprovalNotice(notice: Pick<Notice, 'category' | 'content'>) {
  if (notice.category !== 'approval') return null
  const readId = (pattern: RegExp) => {
    const value = Number(pattern.exec(notice.content)?.[1])
    return Number.isSafeInteger(value) && value > 0 ? value : undefined
  }
  return {
    stepId: readId(/步骤编号\s*[:：]\s*(\d+)(?!\d)/),
    instanceId: readId(/审批编号\s*[:：]\s*(\d+)(?!\d)/),
  }
}
