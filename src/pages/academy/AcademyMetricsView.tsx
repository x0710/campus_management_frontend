import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button } from 'antd'
import { useT } from '../../i18n'

/**
 * 党委学院端：指标（学院指标管理 → 本院加分项设置）。
 * 注意：当前为【模拟数据预览页】，后端暂无接口；接口就绪后替换 MOCK_ITEMS 与按钮动作即可。
 */

interface MockMetricItem {
  id: string
  /** 加分项名称 */
  name: string
  /** 适用对象（i18n key） */
  scopeKey: string
  /** 加分分值 */
  points: number
}

/** 本院加分项（模拟数据） */
const MOCK_ITEMS: MockMetricItem[] = [
  { id: 'i1', name: '国家级课题立项', scopeKey: 'academyMetrics.scopeTeacher', points: 10 },
  { id: 'i2', name: '省级教学成果奖', scopeKey: 'academyMetrics.scopeTeacher', points: 8 },
  { id: 'i3', name: '学科竞赛国家级奖', scopeKey: 'academyMetrics.scopeStudent', points: 6 },
  { id: 'i4', name: '志愿服务满50h', scopeKey: 'academyMetrics.scopeStudent', points: 2 },
  { id: 'i5', name: '学院工作创新建议被采纳', scopeKey: 'academyMetrics.scopeAll', points: 3 },
]

export default function AcademyMetricsView() {
  const t = useT()
  const { message } = AntdApp.useApp()

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('academyMetrics.title')}</h3>
        </header>
        <div className="panel-card-body">
          <h4 className="academy-section-title">{t('academyMetrics.sectionTitle')}</h4>

          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            className="academy-metrics-add"
            onClick={() => message.info(t('academyMetrics.addHint'))}
          >
            {t('academyMetrics.addItem')}
          </Button>

          <div className="academy-metrics-list">
            {MOCK_ITEMS.map((item) => (
              <div key={item.id} className="academy-metrics-item">
                <div className="academy-metrics-info">
                  <div className="academy-metrics-name">{item.name}</div>
                  <div className="academy-metrics-scope">
                    {t('academyMetrics.scopePrefix')}
                    {t(item.scopeKey)}
                  </div>
                </div>
                <span className="academy-metrics-points">
                  +{item.points}
                  {t('party.scoreUnit')}
                </span>
              </div>
            ))}
          </div>

          <Button
            block
            icon={<UploadOutlined />}
            className="academy-metrics-report"
            onClick={() => message.info(t('academyMetrics.reportHint'))}
          >
            {t('academyMetrics.report')}
          </Button>
        </div>
      </section>
    </div>
  )
}
