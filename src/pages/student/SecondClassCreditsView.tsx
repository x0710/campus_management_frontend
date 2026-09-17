import { Alert, Card, Col, Progress, Row, Space, Statistic, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo } from 'react'
import { useT } from '../../i18n'

/**
 * 学生端：第二课堂学分（总进度 + 六大分类进度 + 认定明细）。
 * 注意：当前为【模拟数据预览页】，后端尚无第二课堂学分接口。
 * 接口就绪后：把 MOCK_CATEGORIES / MOCK_DETAILS 替换为 src/api/ 中的请求，
 * 进度与表格渲染逻辑无需改动。
 */

type CreditCategoryKey =
  | 'cat_thought'
  | 'cat_practice'
  | 'cat_volunteer'
  | 'cat_innovation'
  | 'cat_culture'
  | 'cat_work'

interface MockCategory {
  key: CreditCategoryKey
  earned: number
  required: number
}

type CreditStatus = 'confirmed' | 'pending'

interface MockCreditDetail {
  id: string
  /** 对应 i18n 文案 credits.${actKey} */
  actKey: string
  category: CreditCategoryKey
  credit: number
  date: string
  status: CreditStatus
}

/** 六个分类的学分要求与已获学分（已获 = 已认定明细之和） */
const MOCK_CATEGORIES: MockCategory[] = [
  { key: 'cat_thought', earned: 1.5, required: 2 },
  { key: 'cat_practice', earned: 2, required: 2 },
  { key: 'cat_volunteer', earned: 1.5, required: 2 },
  { key: 'cat_innovation', earned: 1, required: 2 },
  { key: 'cat_culture', earned: 2, required: 2 },
  { key: 'cat_work', earned: 0, required: 2 },
]

const MOCK_DETAILS: MockCreditDetail[] = [
  { id: 'd1', actKey: 'act_rural', category: 'cat_practice', credit: 2, date: '2026-07-15', status: 'confirmed' },
  { id: 'd2', actKey: 'act_studentunion', category: 'cat_culture', credit: 2, date: '2026-06-30', status: 'confirmed' },
  { id: 'd3', actKey: 'act_monitor', category: 'cat_work', credit: 1, date: '2026-06-25', status: 'pending' },
  { id: 'd4', actKey: 'act_innovation', category: 'cat_innovation', credit: 1, date: '2026-05-20', status: 'confirmed' },
  { id: 'd5', actKey: 'act_speech', category: 'cat_thought', credit: 1.5, date: '2026-04-08', status: 'confirmed' },
  { id: 'd6', actKey: 'act_marathon', category: 'cat_volunteer', credit: 1, date: '2025-11-23', status: 'confirmed' },
  { id: 'd7', actKey: 'act_welcome', category: 'cat_volunteer', credit: 0.5, date: '2025-09-10', status: 'confirmed' },
]

const TOTAL_REQUIRED = 12

export default function SecondClassCreditsView() {
  const t = useT()

  // 总已获学分以分类配置为准（审核中的明细不计入）
  const totalEarned = useMemo(
    () => MOCK_CATEGORIES.reduce((sum, c) => sum + c.earned, 0),
    [],
  )
  const totalPercent = Math.min(100, Math.round((totalEarned / TOTAL_REQUIRED) * 100))

  const columns = useMemo<ColumnsType<MockCreditDetail>>(
    () => [
      {
        title: t('credits.colActivity'),
        dataIndex: 'actKey',
        key: 'activity',
        render: (actKey: string) => t(`credits.${actKey}`),
      },
      {
        title: t('credits.colCategory'),
        dataIndex: 'category',
        key: 'category',
        width: 140,
        render: (category: CreditCategoryKey) => t(`credits.${category}`),
      },
      {
        title: t('credits.colCredit'),
        dataIndex: 'credit',
        key: 'credit',
        width: 90,
        align: 'center',
      },
      {
        title: t('credits.colDate'),
        dataIndex: 'date',
        key: 'date',
        width: 130,
      },
      {
        title: t('credits.colStatus'),
        dataIndex: 'status',
        key: 'status',
        width: 110,
        align: 'center',
        render: (status: CreditStatus) => (
          <Tag color={status === 'confirmed' ? 'green' : 'orange'}>
            {t(`credits.status_${status}`)}
          </Tag>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('credits.title')}</h3>
        </header>
        <div className="panel-card-body">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert type="warning" showIcon title={t('common.mockHint')} />

            {/* 总学分进度 */}
            <Card size="small">
              <Row gutter={16} align="middle">
                <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                  <Progress
                    type="dashboard"
                    percent={totalPercent}
                    size={160}
                    strokeColor="#2f54eb"
                    format={() => (
                      <span>
                        <span style={{ fontSize: 22, fontWeight: 600 }}>{totalEarned}</span>
                        <span style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>
                          {' '}
                          / {TOTAL_REQUIRED}
                        </span>
                      </span>
                    )}
                  />
                </Col>
                <Col xs={24} sm={16}>
                  <Space direction="vertical" size={12}>
                    <Statistic title={t('credits.totalTitle')} value={totalEarned} suffix={`/ ${TOTAL_REQUIRED}`} />
                    <Statistic title={t('credits.required')} value={TOTAL_REQUIRED} />
                    <Statistic title={t('credits.earned')} value={totalEarned} />
                  </Space>
                </Col>
              </Row>
            </Card>

            {/* 六个分类进度 */}
            {/* <Row gutter={[16, 16]}>
              {MOCK_CATEGORIES.map((cat) => {
                const percent = Math.min(100, Math.round((cat.earned / cat.required) * 100))
                const completed = cat.earned >= cat.required
                return (
                  <Col key={cat.key} xs={24} sm={12} lg={8}>
                    <Card size="small">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span>{t(`credits.${cat.key}`)}</span>
                        <span style={{ color: 'var(--ink-secondary)' }}>
                          {cat.earned} / {cat.required}
                        </span>
                      </div>
                      <Progress
                        percent={percent}
                        strokeColor={completed ? '#0fa968' : '#2f54eb'}
                        size="small"
                      />
                    </Card>
                  </Col>
                )
              })}
            </Row> */}

            {/* 认定明细 */}
            <Card size="small" title={t('credits.detailTitle')}>
              <Table<MockCreditDetail>
                rowKey="id"
                columns={columns}
                dataSource={MOCK_DETAILS}
                pagination={false}
                scroll={{ x: 640 }}
              />
            </Card>
          </Space>
        </div>
      </section>
    </div>
  )
}
