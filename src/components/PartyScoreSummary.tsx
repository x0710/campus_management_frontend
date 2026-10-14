import { useT } from '../i18n'

/**
 * 党员端：总成绩概览（先锋指数卡片 + 基础分/加分项/减分三项）。
 * 首页「先锋指数」与「我的-我的成绩记录」共用该模块。
 * 注意：当前为【模拟数据预览页】，后端暂无接口；接口就绪后替换 MOCK_INDEX 即可。
 */

/** 先锋指数（模拟数据）：总分 = 基础分 + 加分项 - 减分 */
const MOCK_INDEX = {
  /** 当前先锋指数总分 */
  score: 87.5,
  /** 当前等级（i18n key） */
  gradeKey: 'party.grade_demonstration',
  /** 下一等级（i18n key），用于计算差距文案 */
  nextGradeKey: 'party.grade_pioneer',
  /** 距离下一等级还差多少分 */
  gap: 2.5,
  /** 基础分 */
  base: 70,
  /** 加分项已得 / 上限 */
  bonus: 17.5,
  bonusMax: 30,
  /** 减分 */
  deduction: 0,
}

export default function PartyScoreSummary() {
  const t = useT()

  return (
    <>
      {/* 先锋指数：总分 + 等级 + 距离下一等级的差距 */}
      <section className="party-index-card">
        <div className="party-index-title">{t('party.pioneerIndex')}</div>
        <div className="party-index-main">
          <div className="party-index-score">
            <span className="party-index-value">{MOCK_INDEX.score}</span>
            <span className="party-index-unit">{t('party.scoreUnit')}</span>
          </div>
          <span className="party-index-grade">{t(MOCK_INDEX.gradeKey)}</span>
        </div>
        <div className="party-index-gap">
          {t('party.gapToNext', {
            grade: t(MOCK_INDEX.nextGradeKey),
            points: MOCK_INDEX.gap,
          })}
        </div>
      </section>

      {/* 基础分 / 加分项 / 减分 */}
      <div className="party-stats">
        <div className="party-stat">
          <span className="party-stat-label">{t('party.statBase')}</span>
          <span className="party-stat-value">
            {MOCK_INDEX.base}
            {t('party.scoreUnit')}
          </span>
        </div>
        <div className="party-stat">
          <span className="party-stat-label">{t('party.statBonus')}</span>
          <span className="party-stat-value">
            {MOCK_INDEX.bonus}/{MOCK_INDEX.bonusMax}
          </span>
        </div>
        <div className="party-stat">
          <span className="party-stat-label">{t('party.statDeduction')}</span>
          <span className="party-stat-value">{MOCK_INDEX.deduction}</span>
        </div>
      </div>
    </>
  )
}
