import { FileTextOutlined, FlagOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button } from 'antd'
import { useT } from '../../i18n'

/**
 * 党员端：整改提升（整改任务 / 年度整改提升计划 / 历史整改记录）。
 * 注意：当前为【模拟数据预览页】，后端尚未提供整改相关接口。
 * 接口就绪后：把下方的整改任务、年度计划、历史记录替换为 src/api/ 中的请求即可。
 */

/** 历史整改记录（模拟数据） */
const MOCK_HISTORY: { id: string; year: string }[] = [
  { id: 'h1', year: '2025' },
  { id: 'h2', year: '2025' },
]

export default function PartyImprovementView() {
  const t = useT()
  const { message } = AntdApp.useApp()

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      {/* 整改任务 */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyImprovement.taskSection')}</h3>
        </header>
        <div className="panel-card-body">
          <div className="improve-task-card">
            <div className="improve-task-title">
              <FlagOutlined className="improve-task-icon" />
              {t('partyImprovement.currentTask')}
            </div>
            <div className="improve-task-line">
              <span className="improve-task-label">{t('partyImprovement.labelProblem')}</span>
              {t('partyImprovement.task_problem')}
            </div>
            <div className="improve-task-line">
              <span className="improve-task-label">{t('partyImprovement.labelMeasure')}</span>
              {t('partyImprovement.task_measure')}
            </div>
            <div className="improve-task-line">
              <span className="improve-task-label">{t('partyImprovement.labelDeadline')}</span>
              {t('partyImprovement.task_deadline')}
            </div>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              className="improve-task-btn"
              onClick={() => message.info(t('partyImprovement.proofHint'))}
            >
              {t('partyImprovement.uploadProof')}
            </Button>
          </div>
        </div>
      </section>

      {/* 年度整改提升计划 */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyImprovement.planSection')}</h3>
        </header>
        <div className="panel-card-body">
          <Button
            block
            icon={<FileTextOutlined />}
            className="improve-plan-btn"
            onClick={() => message.info(t('partyImprovement.planHint'))}
          >
            {t('partyImprovement.submitPlan', { year: t('partyImprovement.planYear') })}
          </Button>
        </div>
      </section>

      {/* 历史整改记录 */}
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyImprovement.historySection')}</h3>
        </header>
        <div className="panel-card-body">
          <ul className="improve-history-list">
            {MOCK_HISTORY.map((item) => (
              <li key={item.id} className="improve-history-item">
                <div className="improve-history-title">
                  {t('partyImprovement.historyItem', { year: item.year })}
                </div>
                <button
                  type="button"
                  className="improve-history-link"
                  onClick={() => message.info(t('partyImprovement.archiveHint'))}
                >
                  {t('partyImprovement.viewArchive')} →
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
