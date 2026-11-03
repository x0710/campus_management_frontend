/**
 * 党建活动加分分数展示工具。
 *
 * 后端分数为 DecimalText（JSON 字符串，如 "5" / "-2.5"），前端统一按字符串承接并原样透传，
 * 只在展示 / 判断正负时转成数值，避免 number 与 string 混用以及浮点精度丢失。
 */
import type { ApprovalInstanceStep, ApprovalRecordItem } from '../api/types/approvals'
import type { ApprovalStep } from '../api/types/approvalmodel'
import type { PartyScore } from '../api/types/partyScores'
import {
  PARTY_GRADE_DEMONSTRATION_MIN,
  PARTY_GRADE_PIONEER_MIN,
  PARTY_GRADE_PROGRESS_MIN,
  PARTY_SCORE_BASE,
  PARTY_SCORE_DEDUCTION,
  PARTY_SCORE_MAX_BONUS,
  PARTY_SCORE_MAX_TOTAL,
  type PartyScoreApplicationStatus,
} from '../config/partyDeclaration'

/**
 * 把后端分数格式化为展示文本：正数前加「+」，负数与零保持原值，空值返回占位符。
 * @param score 后端返回的 DecimalText（字符串）或空值
 * @returns 展示用分数文本（必返回；空值返回「—」）
 */
export function formatPartyScore(score: string | null | undefined): string {
  if (score === null || score === undefined || score.trim() === '') return '—'
  const numeric = Number(score)
  if (!Number.isFinite(numeric)) return score
  return numeric > 0 ? `+${score}` : score
}

/**
 * 判断分数是否为负数（用于「加分绿色 / 减分红」配色）。
 * @param score 后端返回的 DecimalText（字符串）或空值
 * @returns true 表示负数；空值或非数字返回 false
 */
export function isNegativePartyScore(score: string | null | undefined): boolean {
  if (score === null || score === undefined || score.trim() === '') return false
  const numeric = Number(score)
  return Number.isFinite(numeric) && numeric < 0
}

/**
 * 判断申报是否已核定分数（即审批已通过并写入 approved_score）。
 *
 * @param score 申报记录（至少包含 approved_score；必填）
 * @returns true 表示已核定分数；null / undefined / 空白字符串均视为未核定
 */
export function hasApprovedPartyScore(
  score: Pick<PartyScore, 'approved_score'>,
): boolean {
  const approved = score.approved_score
  return approved !== null && approved !== undefined && approved.trim() !== ''
}

/**
 * 推导单条成绩申报的审核状态。
 *
 * 判定顺序：
 * 1. 审批记录中存在驳回决定 → 被驳回（驳回后审批实例终止，不再继续流转）；
 * 2. 能拿到模板审批步骤时：每个步骤（step_no）都必须有对应的「同意」记录，
 *    或属于「审批人是申请人本人」的自动通过环节，全部完成才算申请成功；
 *    只有部分步骤通过（例如两步审批只完成一步）仍为审核中；
 * 3. 模板步骤获取失败（旧数据 / 权限不足）时回退 `approved_score`：
 *    已核定分数 → 申请成功；
 * 4. 其余情况 → 审核中。
 *
 * 关键点：后端创建审批实例时，若某个环节找不到对应审批人，会把该环节的审批人
 * 设为申请人本人并直接置为 approved，且**不写入审批意见记录**；因此不能只按
 * 「同意记录」计数，否则这类申请会永远缺少一个环节、一直停留在审核中。
 *
 * @param score 申报记录（至少包含 approved_score；必填）
 * @param approvalRecords 该申报审批实例的审批意见记录；为空或未加载时为 undefined/null
 * @param steps 该申报模板的审批步骤（用于判断是否所有环节都已完成）；未知时为 undefined/null
 * @param selfApprovedStepNos 审批人是申请人本人、由后端自动通过的环节序号集合；未知时为 undefined/null
 * @returns PartyScoreApplicationStatus 审核状态
 */
export function resolvePartyScoreApplicationStatus(
  score: Pick<PartyScore, 'approved_score'>,
  approvalRecords?: ApprovalRecordItem[] | null,
  steps?: Pick<ApprovalStep, 'step_no'>[] | null,
  selfApprovedStepNos?: ReadonlySet<number> | null,
): PartyScoreApplicationStatus {
  if (approvalRecords?.some((record) => record.decision === 'reject')) {
    return 'rejected'
  }

  // 模板步骤已知：每个环节都必须有实际的「同意」记录，或属于自动通过环节，
  // 避免首个环节通过就误判申请成功
  const requiredStepNos = steps?.map((step) => step.step_no) ?? []
  if (requiredStepNos.length > 0) {
    const doneStepNos = new Set<number>(
      (approvalRecords ?? [])
        .filter((record) => record.decision === 'agree')
        .map((record) => record.step_order),
    )
    // 审批人是申请人本人的环节由后端自动通过且不产生记录，视为已完成
    for (const stepNo of selfApprovedStepNos ?? []) doneStepNos.add(stepNo)
    return requiredStepNos.every((stepNo) => doneStepNos.has(stepNo))
      ? 'approved'
      : 'pending'
  }

  // 模板步骤不可用时只能回退后端核定分数，保证旧数据仍能正常展示
  return hasApprovedPartyScore(score) ? 'approved' : 'pending'
}

/**
 * 汇总当前用户审批步骤中「已通过」的环节：审批实例 ID → 环节序号集合。
 *
 * 自动通过环节（审批人为申请人本人）与本人实际审批通过的环节都会是 approved，
 * 二者都视为已完成；转交产生的 skipped 环节不计入（后续转交对象仍需审批）。
 *
 * @param steps 当前用户作为审批人的审批步骤（GET /api/approvals）
 * @returns Map<审批实例 ID, Set<环节序号>>
 */
export function collectSelfApprovedStepOrders(
  steps: Pick<ApprovalInstanceStep, 'instance_id' | 'step_order' | 'status'>[],
): Map<number, Set<number>> {
  const result = new Map<number, Set<number>>()
  for (const step of steps) {
    if (step.status !== 'approved') continue
    const stepNos = result.get(step.instance_id) ?? new Set<number>()
    stepNos.add(step.step_order)
    result.set(step.instance_id, stepNos)
  }
  return result
}

/**
 * 把后端返回的项目加分转换为前端展示的党建总分。
 * 后端不返回基础分，因此总分 = 基础分 70 + 项目加分（项目加分上限 30），总分最高 100。
 * @param score 后端项目加分 DecimalText（字符串）或空值
 * @returns 党建总分；空值或非法数字返回 null
 */
export function toPartyScoreTotal(score: string | null | undefined): number | null {
  if (score === null || score === undefined || score.trim() === '') return null
  const raw = Number(score)
  if (!Number.isFinite(raw)) return null
  const bonus = Math.min(raw, PARTY_SCORE_MAX_BONUS)
  return Math.min(PARTY_SCORE_BASE + bonus, PARTY_SCORE_MAX_TOTAL)
}

/**
 * 党建总分展示文本：总分可计算时返回字符串，空值返回占位符。
 * @param score 后端项目加分 DecimalText（字符串）或空值
 * @returns 党建总分文本（如 "75"；空值返回 "—"）
 */
export function formatPartyScoreTotal(score: string | null | undefined): string {
  const total = toPartyScoreTotal(score)
  return total === null ? '—' : String(total)
}

/** 统计类分数（平均分等）展示时最多保留的小数位数 */
export const SCORE_MAX_FRACTION_DIGITS = 3

/**
 * 已换算党建总分（number）的展示文本：最多保留小数点后 3 位，并去掉末尾多余的 0。
 * 用于各组织平均分等带小数的统计值（避免浮点误差产生 70.03499999999999 这类长文本）。
 * @param value 已换算的总分（可为空）
 * @returns 展示文本（如 "70.035" / "70"；空值返回 "—"）
 */
export function formatScoreDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return String(Number(value.toFixed(SCORE_MAX_FRACTION_DIGITS)))
}

/**
 * 后端加分 DecimalText 换算为党建总分后的展示文本（最多保留小数点后 3 位）。
 * @param score 后端项目加分 DecimalText（字符串）或空值
 * @returns 党建总分文本（如 "70.035" / "75"；空值返回 "—"）
 */
export function formatPartyScoreTotalDecimal(score: string | null | undefined): string {
  return formatScoreDecimal(toPartyScoreTotal(score))
}

/** 党员先锋指数汇总结果 */
export interface PartyScoreSummary {
  /** 总分（基础分 + 加分项，最高不超过上限） */
  total: number
  /** 基础分 */
  base: number
  /** 加分项得分（已按上限截断） */
  bonus: number
  /** 加分项展示上限 */
  bonusMax: number
  /** 减分项 */
  deduction: number
}

/** 先锋指数等级 key（与 i18n party.grade_* 文案一一对应） */
export type PartyScoreGrade = 'pioneer' | 'demonstration' | 'progress' | 'warning'

/** 先锋指数等级解析结果 */
export interface PartyScoreGradeInfo {
  /** 当前等级 */
  grade: PartyScoreGrade
  /** 下一等级；已为最高级（先锋级）时为 null */
  nextGrade: PartyScoreGrade | null
  /** 下一等级的达标分数线；已为最高级（先锋级）时为 null */
  nextThreshold: number | null
  /** 距离下一等级还差的分数；已为最高级时为 0 */
  gap: number
}

/**
 * 按总分划分先锋指数等级：先锋级 ≥ 90、示范级 ≥ 80、进位级 ≥ 70、其余为警示级。
 * @param total 先锋指数总分（必填）
 * @returns PartyScoreGradeInfo 等级、下一级分数线与差距
 */
export function getPartyScoreGrade(total: number): PartyScoreGradeInfo {
  if (total >= PARTY_GRADE_PIONEER_MIN) {
    return { grade: 'pioneer', nextGrade: null, nextThreshold: null, gap: 0 }
  }
  if (total >= PARTY_GRADE_DEMONSTRATION_MIN) {
    return {
      grade: 'demonstration',
      nextGrade: 'pioneer',
      nextThreshold: PARTY_GRADE_PIONEER_MIN,
      gap: PARTY_GRADE_PIONEER_MIN - total,
    }
  }
  if (total >= PARTY_GRADE_PROGRESS_MIN) {
    return {
      grade: 'progress',
      nextGrade: 'demonstration',
      nextThreshold: PARTY_GRADE_DEMONSTRATION_MIN,
      gap: PARTY_GRADE_DEMONSTRATION_MIN - total,
    }
  }
  return {
    grade: 'warning',
    nextGrade: 'progress',
    nextThreshold: PARTY_GRADE_PROGRESS_MIN,
    gap: PARTY_GRADE_PROGRESS_MIN - total,
  }
}

/**
 * 根据当前用户的加分申请记录计算先锋指数汇总。
 * 加分项只累加已核定通过的正分数（approved_score 非空且大于 0），
 * 并限制在 PARTY_SCORE_MAX_BONUS；总分 = 基础分 + 加分项，最高 PARTY_SCORE_MAX_TOTAL。
 * 减分项暂固定为 PARTY_SCORE_DEDUCTION（当前为 0）。
 * @param records 当前用户的加分申请记录数组（可为空）
 * @returns PartyScoreSummary 汇总结果
 */
export function computePartyScoreSummary(records: PartyScore[]): PartyScoreSummary {
  const bonusRaw = records.reduce((sum, record) => {
    if (record.approved_score === null || record.approved_score === undefined) return sum
    const score = Number(record.approved_score)
    if (!Number.isFinite(score) || score <= 0) return sum
    return sum + score
  }, 0)

  const bonus = Math.min(bonusRaw, PARTY_SCORE_MAX_BONUS)
  const total = Math.min(PARTY_SCORE_BASE + bonus, PARTY_SCORE_MAX_TOTAL)

  return {
    total,
    base: PARTY_SCORE_BASE,
    bonus,
    bonusMax: PARTY_SCORE_MAX_BONUS,
    deduction: PARTY_SCORE_DEDUCTION,
  }
}
