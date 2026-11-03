/**
 * 党员端成绩申报审核状态 Hook（首页「近期记录」使用）。
 *
 * 仅凭 `approved_score` 无法判断审批是否真正走完：部分后端会在首个环节通过后
 * 就写入核定分数，导致「两步审批只完成一步」也显示申请成功。
 * 因此这里同时读取：
 *   1. 审批实例的审批意见记录（GET /api/approvals/{instanceId}/records）：
 *      出现驳回 → 被驳回；
 *   2. 申报模板的审批步骤（GET /api/approvals/templates/{templateId}）：
 *      每个步骤都必须有对应的「同意」记录，全部完成才算申请成功。
 *
 * 模板步骤取不到时回退 `approved_score`，保证旧数据仍可展示。
 * 审批记录 / 模板详情均走会话缓存，同一实例、同一模板只请求一次。
 */
import { useEffect, useState } from 'react'
import { getApprovalTemplateDetail } from '../api/approvalmodel'
import { getApprovalRecords } from '../api/approvals'
import type { ApprovalRecordItem } from '../api/types/approvals'
import type { ApprovalStep } from '../api/types/approvalmodel'
import type { PartyScore } from '../api/types/partyScores'
import type { PartyScoreApplicationStatus } from '../config/partyDeclaration'
import { resolvePartyScoreApplicationStatus } from '../utils/partyScore'

export interface PartyScoreApplicationStatusesState {
  /** 申报记录 ID → 审核状态；尚未解析完成的记录不在 Map 中 */
  statuses: Map<number, PartyScoreApplicationStatus>
}

/**
 * 批量解析申报记录的审核状态。
 *
 * @param records 需要展示状态的申报记录（可为空数组；按记录 ID 作为结果 key）
 * @returns PartyScoreApplicationStatusesState
 *   - statuses：Map<申报记录 ID, 审核状态>，未解析完成的记录不包含在内
 */
export function usePartyScoreApplicationStatuses(
  records: PartyScore[],
): PartyScoreApplicationStatusesState {
  const [statuses, setStatuses] = useState<Map<number, PartyScoreApplicationStatus>>(
    new Map(),
  )

  useEffect(() => {
    let cancelled = false

    if (records.length === 0) {
      setStatuses(new Map())
      return () => {
        cancelled = true
      }
    }

    // 同一审批实例只请求一次审批记录；同一模板只请求一次步骤
    const instanceIds = [...new Set(records.map((record) => record.approval_instance_id))]
    const templateIds = [
      ...new Set(
        records
          .map((record) => record.template_id)
          .filter(
            (id): id is number =>
              typeof id === 'number' && Number.isFinite(id) && id > 0,
          ),
      ),
    ]

    Promise.all([
      Promise.all(
        instanceIds.map(async (instanceId) => {
          try {
            const list = await getApprovalRecords(instanceId)
            return [instanceId, list] as const
          } catch {
            return [instanceId, null] as const
          }
        }),
      ),
      Promise.all(
        templateIds.map(async (templateId) => {
          try {
            const template = await getApprovalTemplateDetail(templateId)
            return [templateId, template.steps ?? null] as const
          } catch {
            return [templateId, null] as const
          }
        }),
      ),
    ]).then(([recordResults, templateResults]) => {
      if (cancelled) return
      const recordsByInstance = new Map<number, ApprovalRecordItem[] | null>(recordResults)
      const stepsByTemplate = new Map<number, ApprovalStep[] | null>(templateResults)

      const resolved = new Map<number, PartyScoreApplicationStatus>()
      for (const record of records) {
        const templateSteps =
          record.template_id !== undefined
            ? stepsByTemplate.get(record.template_id) ?? null
            : null
        resolved.set(
          record.id,
          resolvePartyScoreApplicationStatus(
            record,
            recordsByInstance.get(record.approval_instance_id) ?? null,
            templateSteps,
          ),
        )
      }
      setStatuses(resolved)
    })

    return () => {
      cancelled = true
    }
  }, [records])

  return { statuses }
}
