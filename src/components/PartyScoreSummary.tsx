import { Skeleton } from 'antd'
import { useMemo } from 'react'
import ErrorState from './ErrorState'
import { useMyPartyScores } from '../composables/useMyPartyScores'
import { useT } from '../i18n'
import { computePartyScoreSummary, getPartyScoreGrade } from '../utils/partyScore'
import type { PartyScoreGrade } from '../utils/partyScore'

/**
 * 党员端：总成绩概览（先锋指数卡片 + 基础分/加分项/减分三项）。
 * 首页「先锋指数」与「我的-我的成绩记录」共用该模块。
 * 分数来自当前用户 GET /api/party-scores：基础分固定 70，加分项按已核定分数累加并封顶 30，
 * 总分封顶 100；减分项暂固定为 0。
 * 等级按总分划分：≥90 先锋级、≥80 示范级、≥70 进位级、其余为警示级。
 */

/** 等级 → i18n 文案 key（与 utils/partyScore.ts 的 PartyScoreGrade 一一对应） */
const PARTY_GRADE_LABEL_KEYS: Record<PartyScoreGrade, string> = {
  pioneer: 'party.grade_pioneer',
  demonstration: 'party.grade_demonstration',
  progress: 'party.grade_progress',
  warning: 'party.grade_warning',
}

/** 把数值展示为整数或一位小数，避免出现 87.0 这类冗余零 */
function formatScoreValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default function PartyScoreSummary() {
  const t = useT()
  const { records, loading, error, refresh } = useMyPartyScores()
  const summary = useMemo(() => computePartyScoreSummary(records), [records])
  const gradeInfo = useMemo(() => getPartyScoreGrade(summary.total), [summary.total])

  if (loading) {
    return <Skeleton active paragraph={{ rows: 3 }} />
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => refresh(true)} />
  }

  const scoreText = formatScoreValue(summary.total)
  const bonusText = `${formatScoreValue(summary.bonus)}/${summary.bonusMax}`

  return (
    <>
      {/* 先锋指数：总分 + 等级 + 距离下一等级的差距 */}
      <section className="party-index-card">
        <div className="party-index-title">{t('party.pioneerIndex')}</div>
        <div className="party-index-main">
          <div className="party-index-score">
            <span className="party-index-value">{scoreText}</span>
            <span className="party-index-unit">{t('party.scoreUnit')}</span>
          </div>
          <span className="party-index-grade">
            {t(PARTY_GRADE_LABEL_KEYS[gradeInfo.grade])}
          </span>
        </div>
        {gradeInfo.nextGrade ? (
          <div className="party-index-gap">
            {t('party.gapToNext', {
              grade: t(PARTY_GRADE_LABEL_KEYS[gradeInfo.nextGrade]),
              points: formatScoreValue(gradeInfo.gap),
            })}
          </div>
        ) : null}
      </section>

      {/* 基础分 / 加分项 / 减分 */}
      <div className="party-stats">
        <div className="party-stat">
          <span className="party-stat-label">{t('party.statBase')}</span>
          <span className="party-stat-value">
            {summary.base}
            {t('party.scoreUnit')}
          </span>
        </div>
        <div className="party-stat">
          <span className="party-stat-label">{t('party.statBonus')}</span>
          <span className="party-stat-value">
            {bonusText}
          </span>
        </div>
        <div className="party-stat">
          <span className="party-stat-label">{t('party.statDeduction')}</span>
          <span className="party-stat-value">{summary.deduction}</span>
        </div>
      </div>
    </>
  )
}
