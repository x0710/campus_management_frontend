import { Alert } from 'antd'
import { useT } from '../../i18n'

/**
 * 党委学校端：总览（学校驾驶舱 → 全校党建驾驶舱 / 各二级党委排名）。
 * 注意：当前为【模拟数据预览页】，后端暂无接口；接口就绪后替换 MOCK_* 常量即可。
 */

/** 全校党建驾驶舱（模拟数据） */
const MOCK_MEMBER_COUNT = 4286
const MOCK_AVG_SCORE = 80.2

/** 各二级党委排名（模拟数据）：tone 为 top 时红色，normal 时蓝色 */
const MOCK_RANKING: { id: string; name: string; score: number; tone: 'top' | 'normal' }[] = [
  { id: 'c1', name: '马克思主义学院', score: 88, tone: 'top' },
  { id: 'c2', name: '商学院', score: 85, tone: 'top' },
  { id: 'c3', name: '电信学院', score: 83, tone: 'normal' },
  { id: 'c4', name: '数理学院', score: 79, tone: 'normal' },
  { id: 'c5', name: '建工学院', score: 76, tone: 'normal' },
  { id: 'c6', name: '文学院', score: 72, tone: 'normal' },
]

export default function SchoolOverviewView() {
  const t = useT()

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('school.title')}</h3>
        </header>
        <div className="panel-card-body">
          {/* 全校党建驾驶舱 */}
          <h4 className="school-section-title">{t('school.cockpitTitle')}</h4>
          <div className="school-overview">
            <div className="school-overview-item">
              <span className="school-overview-label">{t('school.statMembers')}</span>
              <span className="school-overview-value">
                {MOCK_MEMBER_COUNT}
                <em className="school-overview-unit">{t('school.membersUnit')}</em>
              </span>
            </div>
            <div className="school-overview-item">
              <span className="school-overview-label">{t('school.statAvgScore')}</span>
              <span className="school-overview-value">{MOCK_AVG_SCORE}</span>
            </div>
          </div>

          {/* 各二级党委排名 */}
          <h4 className="school-section-title">{t('school.rankingTitle')}</h4>
          <div className="school-rank-list">
            {MOCK_RANKING.map((item, index) => (
              <div key={item.id} className="school-rank-row">
                <span className="school-rank-name">
                  {index + 1}. {item.name}
                </span>
                <div className="school-rank-track">
                  <div
                    className={`school-rank-bar school-rank-bar--${item.tone}`}
                    style={{ width: `${item.score}%` }}
                  />
                  <span className="school-rank-score">{item.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
