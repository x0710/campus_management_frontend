import { RightOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp } from 'antd'
import { useT } from '../../i18n'

/**
 * 党委学院端：工作台（学院先锋指数总览 / 各支部排名 / 待党委认定）。
 * 注意：当前为【模拟数据预览页】，后端暂无接口；接口就绪后替换 MOCK_* 常量即可。
 */

/** 各支部排名（模拟数据）：tone 为 high 时蓝色，low 时橙色 */
const MOCK_RANKING: { id: string; name: string; score: number; tone: 'high' | 'low' }[] = [
  { id: 'r1', name: '行政支部', score: 88.6, tone: 'high' },
  { id: 'r2', name: '教师一支部', score: 82.1, tone: 'high' },
  { id: 'r3', name: '学生一支部', score: 78.3, tone: 'low' },
  { id: 'r4', name: '学生二支部', score: 72.5, tone: 'low' },
]

/** 学院先锋指数总览（模拟数据） */
const MOCK_MEMBER_COUNT = 312
const MOCK_AVG_SCORE = 79.6
/** 待党委认定的加分条数（模拟数据） */
const MOCK_PENDING_COUNT = 12

export default function AcademyWorkbenchView() {
  const t = useT()
  const { message } = AntdApp.useApp()

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('academy.title')}</h3>
        </header>
        <div className="panel-card-body">
          {/* 学院先锋指数总览 */}
          <h4 className="academy-section-title">{t('academy.overviewTitle')}</h4>
          <div className="academy-overview">
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('academy.statMembers')}</span>
              <span className="academy-overview-value">
                {MOCK_MEMBER_COUNT}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('academy.statAvgScore')}</span>
              <span className="academy-overview-value">{MOCK_AVG_SCORE}</span>
            </div>
          </div>

          {/* 各支部排名 */}
          <h4 className="academy-section-title">{t('academy.rankingTitle')}</h4>
          <div className="academy-rank-list">
            {MOCK_RANKING.map((branch, index) => (
              <div key={branch.id} className="academy-rank-row">
                <span className="academy-rank-name">
                  {index + 1}. {branch.name}
                </span>
                <div className="academy-rank-track">
                  <div
                    className={`academy-rank-bar academy-rank-bar--${branch.tone}`}
                    style={{ width: `${branch.score}%` }}
                  />
                  <span className="academy-rank-score">{branch.score}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 待党委认定 */}
          <h4 className="academy-section-title">{t('academy.pendingTitle')}</h4>
          <button
            type="button"
            className="academy-pending"
            onClick={() => message.info(t('academy.pendingHint'))}
          >
            <span className="academy-pending-text">
              {t('academy.pendingItem', { count: MOCK_PENDING_COUNT })}
            </span>
            <RightOutlined className="academy-pending-icon" />
          </button>
        </div>
      </section>
    </div>
  )
}
