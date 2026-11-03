/**
 * 党员端成绩申报审核状态 Hook（首页「近期记录」使用）。
 *
 * 仅凭 `approved_score` 无法判断审批是否真正走完：部分后端会在首个环节通过后
 * 就写入核定分数，导致「两步审批只完成一步」也显示申请成功。
 * 因此这里同时读取：
 *   1. 审批实例的审批意见记录（GET /api/approvals/{instanceId}/records）：
 *      出现驳回 → 被驳回；
 *   2. 申报模板的审批步骤（GET /api/approvals/templates/{templateId}）：
 *      每个步骤都必须有对应的「同意」记录，全部完成才算申请成功；
 *   3. 当前用户作为审批人的审批步骤（GET /api/approvals）：
 *      审批人是申请人本人的环节由后端直接置为已通过且不产生审批记录，
 *      这些自动通过环节同样计入已完成，避免这类申请一直显示「审核中」。
 *
 * 审批记录 / 模板步骤 / 自动通过环节均尽量并行读取；任一辅助数据取不到时
 * 按其余数据降级判定，保证旧数据仍可展示。
 */
import { useEffect, useState } from 'react'
import { getApprovalTemplateDetail } from '../api/approvalmodel'
import { getApprovalRecords, queryMyApprovalSteps } from '../api/approvals'
import type { ApprovalInstanceStep, ApprovalRecordItem } from '../api/types/approvals'
import type { ApprovalStep } from '../api/types/approvalmodel'
import type { PartyScore } from '../api/types/partyScores'
import type { PartyScoreApplicationStatus } from '../config/partyDeclaration'
import {
  collectSelfApprovedStepOrders,
  resolvePartyScoreApplicationStatus,
} from '../utils/partyScore'

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
      // 自动通过环节（审批人为申请人本人）没有审批记录，需额外读取本人审批步骤；
      // 读取失败时按空集合降级，退回原有「同意记录」判定
      queryMyApprovalSteps().catch((): ApprovalInstanceStep[] => []),
    ]).then(([recordResults, templateResults, mySteps]) => {
      if (cancelled) return
      const recordsByInstance = new Map<number, ApprovalRecordItem[] | null>(recordResults)
      const stepsByTemplate = new Map<number, ApprovalStep[] | null>(templateResults)
      // 审批实例 ID → 本人审批步骤中已通过的环节序号（含后端自动通过的环节）
      const selfApprovedStepOrders = collectSelfApprovedStepOrders(mySteps)

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
            selfApprovedStepOrders.get(record.approval_instance_id) ?? null,
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
