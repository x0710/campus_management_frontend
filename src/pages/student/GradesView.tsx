import { Alert, Card, Col, Row, Select, Space, Statistic, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import { useT } from '../../i18n'

/**
 * 学生端：成绩查询（学期筛选 + 学分/均分/GPA 统计 + 成绩明细）。
 * 注意：当前为【模拟数据预览页】，后端尚无成绩接口。
 * 接口就绪后：把 MOCK_GRADES 替换为 src/api/ 中的请求，表格与统计逻辑无需改动。
 */

type GradeStatus = 'pass' | 'fail' | 'makeup'

interface MockGrade {
  id: string
  term: 'term_1' | 'term_2'
  /** 对应 i18n 文案 grades.${nameKey} */
  nameKey: string
  code: string
  credit: number
  score: number
  gpa: number
  status: GradeStatus
}

const MOCK_GRADES: MockGrade[] = [
  // 2024-2025 第二学期
  { id: 'g1', term: 'term_2', nameKey: 'course_math', code: 'MATH101', credit: 5, score: 92, gpa: 4.0, status: 'pass' },
  { id: 'g2', term: 'term_2', nameKey: 'course_english', code: 'ENG101', credit: 4, score: 85, gpa: 3.7, status: 'pass' },
  { id: 'g3', term: 'term_2', nameKey: 'course_pe', code: 'PE101', credit: 1, score: 78, gpa: 3.0, status: 'pass' },
  { id: 'g4', term: 'term_2', nameKey: 'course_history', code: 'HIST101', credit: 2, score: 88, gpa: 3.7, status: 'pass' },
  // 2025-2026 第一学期
  { id: 'g5', term: 'term_1', nameKey: 'course_data', code: 'CS201', credit: 4, score: 91, gpa: 4.0, status: 'pass' },
  { id: 'g6', term: 'term_1', nameKey: 'course_english', code: 'ENG201', credit: 4, score: 82, gpa: 3.3, status: 'pass' },
  { id: 'g7', term: 'term_1', nameKey: 'course_politics', code: 'POL102', credit: 3, score: 76, gpa: 2.7, status: 'pass' },
  { id: 'g8', term: 'term_1', nameKey: 'course_program', code: 'CS202', credit: 2, score: 89, gpa: 3.7, status: 'pass' },
  // 物理期末不及格，补考通过（成绩与绩点按补考记载）
  { id: 'g9', term: 'term_1', nameKey: 'course_physics', code: 'PHY101', credit: 4, score: 58, gpa: 0, status: 'fail' },
]

const STATUS_COLOR: Record<GradeStatus, string> = {
  pass: 'green',
  fail: 'red',
  makeup: 'orange',
}

export default function GradesView() {
  const t = useT()
  const [term, setTerm] = useState<'all' | 'term_1' | 'term_2'>('all')

  const filtered = useMemo(
    () => (term === 'all' ? MOCK_GRADES : MOCK_GRADES.filter((g) => g.term === term)),
    [term],
  )

  // 学分：不及格不计已修学分；均分：全部修读记录的算术平均；
  // GPA：仅对获得学分的课程（通过/补考通过）做学分加权
  const stats = useMemo(() => {
    const passed = filtered.filter((g) => g.status !== 'fail')
    const credits = passed.reduce((sum, g) => sum + g.credit, 0)
    const average =
      filtered.length > 0
        ? filtered.reduce((sum, g) => sum + g.score, 0) / filtered.length
        : 0
    const gpa =
      credits > 0
        ? passed.reduce((sum, g) => sum + g.gpa * g.credit, 0) / credits
        : 0
    return { credits, average, gpa }
  }, [filtered])

  const columns = useMemo<ColumnsType<MockGrade>>(
    () => [
      {
        title: t('grades.colCourse'),
        dataIndex: 'nameKey',
        key: 'course',
        render: (nameKey: string) => t(`grades.${nameKey}`),
      },
      {
        title: t('grades.colCode'),
        dataIndex: 'code',
        key: 'code',
        width: 130,
      },
      {
        title: t('grades.colCredit'),
        dataIndex: 'credit',
        key: 'credit',
        width: 90,
        align: 'center',
      },
      {
        title: t('grades.colScore'),
        dataIndex: 'score',
        key: 'score',
        width: 100,
        align: 'center',
        render: (score: number) => (
          <span style={{ fontWeight: 600, color: score < 60 ? '#cf1322' : score >= 90 ? '#389e0d' : undefined }}>
            {score}
          </span>
        ),
      },
      {
        title: t('grades.colGpa'),
        dataIndex: 'gpa',
        key: 'gpa',
        width: 90,
        align: 'center',
        render: (gpa: number) => gpa.toFixed(1),
      },
      {
        title: t('grades.colStatus'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        align: 'center',
        render: (status: GradeStatus) => (
          <Tag color={STATUS_COLOR[status]}>{t(`grades.status_${status}`)}</Tag>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('grades.title')}</h3>
          <Select
            size="small"
            value={term}
            onChange={setTerm}
            style={{ width: 220 }}
            options={[
              { value: 'all', label: t('grades.termAll') },
              { value: 'term_1', label: t('grades.term_1') },
              { value: 'term_2', label: t('grades.term_2') },
            ]}
          />
        </header>
        <div className="panel-card-body">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert type="warning" showIcon title={t('common.mockHint')} />

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title={t('grades.statCredits')} value={stats.credits} suffix="" />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title={t('grades.statAverage')} value={stats.average} precision={1} />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic title={t('grades.statGpa')} value={stats.gpa} precision={2} />
                </Card>
              </Col>
            </Row>

            <Table<MockGrade>
              rowKey="id"
              columns={columns}
              dataSource={filtered}
              pagination={false}
              scroll={{ x: 640 }}
            />
          </Space>
        </div>
      </section>
    </div>
  )
}
