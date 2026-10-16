import { Alert } from 'antd'
import { useT } from '../../i18n'

/**
 * 党委支部端：工作台（本支部概况 / 等级分布 / 待办事项）。
 * 注意：当前为【模拟数据预览页】，后端尚未提供党委支部端相关接口；
 * 接口就绪后把 MOCK_OVERVIEW / MOCK_DISTRIBUTION / MOCK_TODOS 替换为 src/api/ 请求即可。
 */

/** 本支部概况（模拟数据） */
const MOCK_OVERVIEW = {
  /** 党员总数（人） */
  members: 128,
  /** 平均分（分） */
  avgScore: 82.4,
}

/** 等级分布（模拟数据），各等级人数合计与党员总数保持一致 */
const MOCK_DISTRIBUTION: { key: string; tone: string; count: number }[] = [
  { key: 'branch.grade_pioneer', tone: 'pioneer', count: 32 },
  { key: 'branch.grade_demonstration', tone: 'demonstration', count: 58 },
  { key: 'branch.grade_progress', tone: 'progress', count: 26 },
  { key: 'branch.grade_warning', tone: 'warning', count: 12 },
]

/** 待办事项（模拟数据） */
const MOCK_TODOS: { id: string; labelKey: string; count: number; unitKey: string }[] = [
  { id: 'approve', labelKey: 'branch.todo_approve', count: 5, unitKey: 'branch.todoUnitItems' },
  { id: 'deduct', labelKey: 'branch.todo_deduct', count: 1, unitKey: 'branch.todoUnitItems' },
  { id: 'rectify', labelKey: 'branch.todo_rectify', count: 2, unitKey: 'branch.todoUnitPeople' },
]

export default function BranchWorkbenchView() {
  const t = useT()
  // 横向柱状图以最高人数为满长基准
  const maxCount = Math.max(...MOCK_DISTRIBUTION.map((item) => item.count))

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      {/* 本支部概况 */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('branch.overviewTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <div className="branch-overview">
            <div className="branch-overview-item">
              <div className="branch-overview-label">{t('branch.statMembers')}</div>
              <div className="branch-overview-value">
                {MOCK_OVERVIEW.members}
                <span className="branch-overview-unit">{t('branch.membersUnit')}</span>
              </div>
            </div>
            <div className="branch-overview-item">
              <div className="branch-overview-label">{t('branch.statAvgScore')}</div>
              <div className="branch-overview-value">
                {MOCK_OVERVIEW.avgScore}
                <span className="branch-overview-unit">{t('party.scoreUnit')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 等级分布（横向柱状图） */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('branch.distributionTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <div className="branch-chart-list">
            {MOCK_DISTRIBUTION.map((item) => (
              <div key={item.tone} className="branch-chart-row">
                <span className="branch-chart-label">{t(item.key)}</span>
                <div className="branch-chart-track">
                  <div
                    className={`branch-chart-bar branch-bar-${item.tone}`}
                    style={{ width: `${Math.round((item.count / maxCount) * 100)}%` }}
                  />
                  <span className="branch-chart-value">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 待办事项 */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('branch.todoTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <ul className="branch-todo-list">
            {MOCK_TODOS.map((todo) => (
              <li key={todo.id} className="branch-todo-item">
                <span className="branch-todo-label">{t(todo.labelKey)}</span>
                <span className="branch-todo-count">
                  {todo.count}
                  <span className="branch-todo-unit">{t(todo.unitKey)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
