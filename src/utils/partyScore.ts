/**
 * 党建活动加分分数展示工具。
 *
 * 后端分数为 DecimalText（JSON 字符串，如 "5" / "-2.5"），前端统一按字符串承接并原样透传，
 * 只在展示 / 判断正负时转成数值，避免 number 与 string 混用以及浮点精度丢失。
 */
import type { PartyScore } from '../api/types/partyScores'
import {
  PARTY_GRADE_DEMONSTRATION_MIN,
  PARTY_GRADE_PIONEER_MIN,
  PARTY_GRADE_PROGRESS_MIN,
  PARTY_SCORE_BASE,
  PARTY_SCORE_DEDUCTION,
  PARTY_SCORE_MAX_BONUS,
  PARTY_SCORE_MAX_TOTAL,
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
