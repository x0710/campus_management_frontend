/**
 * 学生端：成绩查询（仅本人成绩）。
 *
 * 数据流：当前登录用户 uid（GET /api/credentials/me，会话缓存）
 *   → GET /api/examinations?uid=本人（分页取满，会话缓存）
 *   → 课程 ID 批量解析课程名称/学分（useCourseDetails，会话缓存）。
 *
 * 范围限制：本页不提供任何 uid 输入，只使用登录态返回的 uid 查询，
 * 因此学生只能看到本人成绩（后端 /api/examinations 需 examination.select 权限）。
 *
 * 交互：学期筛选（选项来自本人成绩数据）、学分/均分统计、成绩明细表格
 * （每页 20 行，支持直接输入页码跳转并显示总页数）、点击行经
 * GET /api/examinations/{id} 查看该条成绩完整详情（ai 要求 14）。
 *
 * 绩点：后端未提供绩点字段（也无换算规则接口），因此不做任何前端换算，
 * 界面统一展示「暂无法查询」，避免用约定表填充出虚假数据（ai 要求 8）。
 */
/* eslint-disable react/set-state-in-effect */
import { ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractErrorWithStatus } from '../../api/common'
import {
  getScore,
  listAllScoresForUser,
  type CourseScoreDetail,
  type CourseScoreInfo,
  type ExamType,
} from '../../api/examinations'
import { useCourseDetails } from '../../composables/useCourseNames'
import {
  EXAM_TYPE_COLOR,
  STUDENT_SCORE_PAGE_SIZE,
  scoreColor,
} from '../../config/examination'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** 成绩状态（由 is_pass 与考试类型推导，对应 i18n grades.status_*） */
type GradeStatus = 'pass' | 'fail' | 'makeup'

const STATUS_COLOR: Record<GradeStatus, string> = {
  pass: 'green',
  fail: 'red',
  makeup: 'orange',
}

/** 由后端字段推导展示状态：补考/重修且及格记为「补考通过」 */
function toStatus(record: CourseScoreInfo): GradeStatus {
  if (!record.is_pass) return 'fail'
  return record.exam_type === 'makeup' || record.exam_type === 'retake' ? 'makeup' : 'pass'
}

export default function GradesView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  const [scores, setScores] = useState<CourseScoreInfo[]>([])
  const [loading, setLoading] = useState(true)
  // 错误信息保留后端状态码，便于调试（如 "403 Forbidden"、"404 Not Found"）
  const [error, setError] = useState<string | null>(null)
  const [semester, setSemester] = useState<string>('all')
  const [page, setPage] = useState(1)
  // 重载令牌：seq 变化触发重新加载，force=true 时绕过会话缓存（手动刷新）
  const [reload, setReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  // ---- 单条成绩详情弹窗 ----
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<CourseScoreDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const errorText = useCallback(
    (code: string) =>
      code === 'network'
        ? t('common.networkError')
        : code === 'failed'
          ? t('common.loadFailed')
          : code,
    [t],
  )

  // ============ 本人成绩加载 ============
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 只使用登录态 uid 查询，学生无法指定他人
      const me = await getCurrentUser()
      setScores(await listAllScoresForUser(me.uid, reload.force))
    } catch (err) {
      // 401 由全局拦截器处理，这里不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorWithStatus(err))
      }
    } finally {
      setLoading(false)
    }
  }, [reload.seq, reload.force]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

  // 学期筛选选项来自本人成绩数据（非硬编码学期）
  const semesterOptions = useMemo(() => {
    const values = [...new Set(scores.map((s) => s.semester))].sort()
    return [
      { value: 'all', label: t('grades.termAll') },
      ...values.map((v) => ({ value: v, label: v })),
    ]
  }, [scores, t])

  // 刷新后所选学期已不存在时按「全部学期」处理（派生值，避免额外副作用）
  const activeSemester =
    semester !== 'all' && !scores.some((s) => s.semester === semester) ? 'all' : semester

  const filtered = useMemo(
    () =>
      activeSemester === 'all'
        ? scores
        : scores.filter((s) => s.semester === activeSemester),
    [scores, activeSemester],
  )

  // 批量解析课程名称/学分（走会话缓存）
  const courseDetails = useCourseDetails(
    useMemo(() => scores.map((s) => s.course_id), [scores]),
  )

  // 学分：不及格不计已修学分；均分：全部修读记录的算术平均。
  // 绩点：后端未提供该字段，不做前端换算（换算结果属于虚假数据），界面统一显示「暂无法查询」。
  const stats = useMemo(() => {
    let credits = 0
    let scoreSum = 0
    for (const s of filtered) {
      const value = Number(s.score)
      const credit = Number(courseDetails.get(s.course_id)?.credit ?? 0) || 0
      if (Number.isFinite(value)) scoreSum += value
      if (s.is_pass) credits += credit
    }
    return {
      credits,
      average: filtered.length > 0 ? scoreSum / filtered.length : 0,
    }
  }, [filtered, courseDetails])

  // ============ 单条成绩详情 ============
  const openDetail = useCallback(
    async (id: number) => {
      setDetailOpen(true)
      setDetail(null)
      setDetailError(null)
      setDetailLoading(true)
      try {
        setDetail(await getScore(id))
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setDetailError(extractErrorWithStatus(err))
        }
      } finally {
        setDetailLoading(false)
      }
    },
    [],
  )

  // ============ 列定义 ============
  const columns = useMemo<ColumnsType<CourseScoreInfo>>(
    () => [
      {
        title: t('grades.colCourse'),
        dataIndex: 'course_id',
        key: 'course_id',
        ellipsis: true,
        render: (id: number) =>
          courseDetails.has(id)
            ? (
                <span title={courseDetails.get(id)?.course_name ?? undefined}>
                  {courseDetails.get(id)?.course_name ?? `#${id}`}
                </span>
              )
            : t('common.loading'),
      },
      {
        title: t('grades.colCode'),
        dataIndex: 'course_id',
        key: 'code',
        width: 130,
        render: (id: number) => courseDetails.get(id)?.course_code || '—',
      },
      {
        title: t('grades.colSemester'),
        dataIndex: 'semester',
        key: 'semester',
        width: 180,
        render: (v: string) => <span title={v}>{v}</span>,
      },
      {
        title: t('grades.colExamType'),
        dataIndex: 'exam_type',
        key: 'exam_type',
        width: 110,
        align: 'center',
        render: (v: ExamType) => (
          <Tag color={EXAM_TYPE_COLOR[v]}>{t(`teacherGrades.examType_${v}`)}</Tag>
        ),
      },
      {
        title: t('grades.colCredit'),
        dataIndex: 'course_id',
        key: 'credit',
        width: 90,
        align: 'center',
        render: (id: number) => courseDetails.get(id)?.credit ?? '—',
      },
      {
        title: t('grades.colScore'),
        dataIndex: 'score',
        key: 'score',
        width: 100,
        align: 'center',
        render: (v: string, record) => (
          <span style={{ fontWeight: 600, color: scoreColor(v, record.is_pass) }}>{v}</span>
        ),
      },
      {
        title: t('grades.colStatus'),
        key: 'status',
        width: 120,
        align: 'center',
        render: (_, record) => {
          const status = toStatus(record)
          return <Tag color={STATUS_COLOR[status]}>{t(`grades.status_${status}`)}</Tag>
        },
      },
    ],
    [t, courseDetails],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / STUDENT_SCORE_PAGE_SIZE))

  return (
    <div className="student-view">
     

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('grades.title')}</h3>
          <div className="student-toolbar">
            <Tooltip title={t('grades.semesterFilterHint')}>
              <Select
                size="small"
                value={activeSemester}
                onChange={(v: string) => {
                  setSemester(v)
                  setPage(1)
                }}
                style={{ width: 220 }}
                options={semesterOptions}
              />
            </Tooltip>
            <Tooltip title={t('grades.refreshHint')}>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
                loading={loading}
              >
                {t('common.refresh')}
              </Button>
            </Tooltip>
          </div>
        </header>
        <div className="panel-card-body">
          {error ? (
            <Alert
              type="error"
              showIcon
              title={errorText(error)}
              action={
                <Button
                  size="small"
                  onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
                >
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic title={t('grades.statCredits')} value={stats.credits} />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card size="small">
                    <Statistic title={t('grades.statAverage')} value={stats.average} precision={1} />
                  </Card>
                </Col>
                <Col xs={24} sm={8}>
                  <Card size="small">
                    {/* 绩点后端未提供，不做前端换算，直接展示「暂无法查询」 */}
                    <Tooltip title={t('grades.gpaUnavailableHint')}>
                      <span>
                        <Statistic
                          title={t('grades.statGpa')}
                          value={t('grades.gpaUnavailable')}
                        />
                      </span>
                    </Tooltip>
                  </Card>
                </Col>
              </Row>

              <Table<CourseScoreInfo>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={filtered}
                locale={{ emptyText: t('common.noData') }}
                scroll={{ x: 810 }}
                onRow={(record: CourseScoreInfo) => ({
                  onClick: () => void openDetail(record.id),
                  title: t('grades.rowClickHint'),
                  style: { cursor: 'pointer' },
                })}
                pagination={{
                  current: page,
                  pageSize: STUDENT_SCORE_PAGE_SIZE,
                  total: filtered.length,
                  showSizeChanger: false,
                  showQuickJumper: true,
                  showTotal: (n: number) =>
                    `${t('common.total')} ${n} ${t('common.items')}，${t('grades.totalPages', { n: totalPages })}`,
                  onChange: (p: number) => setPage(p),
                }}
              />
            </Space>
          )}
        </div>
      </section>

      {/* 单条成绩详情 */}
      <Modal
        open={detailOpen}
        title={t('grades.detailTitle')}
        footer={<Button onClick={() => setDetailOpen(false)}>{t('common.close')}</Button>}
        onCancel={() => setDetailOpen(false)}
        destroyOnHidden
      >
        {detailError ? (
          <Alert type="error" showIcon title={errorText(detailError)} />
        ) : (
          <Spin spinning={detailLoading}>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                {
                  key: 'course',
                  label: t('grades.colCourse'),
                  children: detail
                    ? (courseDetails.get(detail.course_id)?.course_name ??
                      `#${detail.course_id}`)
                    : '—',
                },
                {
                  key: 'semester',
                  label: t('grades.colSemester'),
                  children: detail?.semester ?? '—',
                },
                {
                  key: 'exam_type',
                  label: t('grades.colExamType'),
                  children: detail ? t(`teacherGrades.examType_${detail.exam_type}`) : '—',
                },
                {
                  key: 'score',
                  label: t('grades.colScore'),
                  children: detail?.score ?? '—',
                },
                {
                  key: 'status',
                  label: t('grades.colStatus'),
                  children: detail ? t(`grades.status_${toStatus(detail)}`) : '—',
                },
                {
                  key: 'remark',
                  label: t('grades.remark'),
                  children: detail?.remark || '—',
                },
                {
                  key: 'created_at',
                  label: t('grades.createdAt'),
                  children: detail ? formatDateTime(detail.created_at, locale) : '—',
                },
                {
                  key: 'updated_at',
                  label: t('grades.updatedAt'),
                  children: detail ? formatDateTime(detail.updated_at, locale) : '—',
                },
              ]}
            />
          </Spin>
        )}
      </Modal>
    </div>
  )
}
