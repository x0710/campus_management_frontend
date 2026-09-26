/**
 * 教师端：学生成绩展示。
 *
 * 数据范围（只可展示老师所在组织的学生成绩）：
 *   当前登录用户 uid → 所在组织 → 组织内「学生」职位成员（见 useOrgStudents）。
 *   后端 /api/examinations 没有组织过滤参数，因此范围限定在前端完成。
 *
 * 查询方式（分页单位 = 学生，每页 20 人）：
 *   按页取该页学生的成绩（GET /api/examinations?uid=X，走会话缓存），
 *   学生姓名与学生所在组织由组织成员解析结果直接得到，课程名称按 course_id 批量解析。
 *
 * 交互：
 *   - 表格每页 20 名学生，支持上一页/下一页与直接输入页码跳转，并显示学生总数与总页数；
 *   - 点击学生行打开「学生成绩明细」弹窗（代码要求 14）；
 *   - 弹窗内点击某条成绩，通过 GET /api/examinations/{id} 加载该条成绩的完整详情。
 */
import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Modal, Select, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractError } from '../../api/common'
import { getScore, listAllScoresForUser } from '../../api/examinations'
import type {
  CourseScoreDetail,
  CourseScoreInfo,
  ExamType,
} from '../../api/types/examinations'
import { useCourseNames } from '../../composables/useCourseNames'
import { useOrgStudents, type OrgStudent } from '../../composables/useOrgStudents'
import { useUserNames } from '../../composables/useUserNames'
import { EXAM_TYPE_COLOR, SCORE_STUDENT_PAGE_SIZE, scoreColor } from '../../config/examination'
import { useT, type TranslateFn } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** 单个学生的成绩统计（列表列展示用） */
interface StudentStat {
  count: number
  average: number
  failed: number
}

/**
 * 成绩明细表：课程名称 / 学期 / 考试类型 / 成绩 / 是否及格。
 * 学生行展开与「学生成绩明细」弹窗共用，点击行可按 id 拉取该条成绩的完整详情（代码要求 14）。
 */
function ScoreDetailTable({
  scores,
  courseNames,
  t,
  locale,
}: {
  scores: CourseScoreInfo[]
  courseNames: Map<number, string | null>
  t: TranslateFn
  locale: 'zh' | 'en'
}) {
  const [detail, setDetail] = useState<CourseScoreDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // 切换学生或刷新数据时清空已展开的单条详情
  useEffect(() => {
    setDetail(null)
    setDetailError(null)
  }, [scores])

  const openDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true)
      setDetailError(null)
      try {
        setDetail(await getScore(id))
      } catch (err) {
        // 401 由全局拦截器处理，这里不重复提示
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setDetailError(extractError(err))
        }
      } finally {
        setDetailLoading(false)
      }
    },
    [],
  )

  const columns = useMemo<ColumnsType<CourseScoreInfo>>(
    () => [
      {
        title: t('teacherGrades.colCourse'),
        dataIndex: 'course_id',
        key: 'course_id',
        width: 200,
        ellipsis: true,
        render: (id: number) =>
          courseNames.has(id)
            ? (
                <span title={courseNames.get(id) ?? undefined}>
                  {courseNames.get(id) ?? `#${id}`}
                </span>
              )
            : t('common.loading'),
      },
      {
        title: t('teacherGrades.colSemester'),
        dataIndex: 'semester',
        key: 'semester',
        width: 200,
        render: (v: string) => <span title={v}>{v}</span>,
      },
      {
        title: t('teacherGrades.colExamType'),
        dataIndex: 'exam_type',
        key: 'exam_type',
        width: 110,
        render: (v: ExamType) => (
          <Tag color={EXAM_TYPE_COLOR[v]}>{t(`teacherGrades.examType_${v}`)}</Tag>
        ),
      },
      {
        title: t('teacherGrades.colScore'),
        dataIndex: 'score',
        key: 'score',
        width: 100,
        align: 'center',
        render: (v: string, record) => (
          <span style={{ fontWeight: 600, color: scoreColor(v, record.is_pass) }}>{v}</span>
        ),
      },
      {
        title: t('teacherGrades.colPass'),
        dataIndex: 'is_pass',
        key: 'is_pass',
        width: 110,
        align: 'center',
        render: (v: boolean) => (
          <Tag color={v ? 'green' : 'red'}>
            {t(v ? 'teacherGrades.pass' : 'teacherGrades.fail')}
          </Tag>
        ),
      },
    ],
    [t, courseNames],
  )

  return (
    <>
      {detailError && (
        <Alert type="error" showIcon title={detailError} style={{ marginBottom: 12 }} />
      )}
      {detail && (
        <Descriptions
          size="small"
          bordered
          column={1}
          style={{ marginBottom: 12 }}
          title={
            <span>
              {t('teacherGrades.scoreDetailTitle')}
              <Button
                type="link"
                size="small"
                onClick={() => setDetail(null)}
                style={{ marginInlineStart: 8 }}
              >
                {t('common.close')}
              </Button>
            </span>
          }
        >
          <Descriptions.Item label={t('teacherGrades.colCourse')}>
            {courseNames.get(detail.course_id) ?? `#${detail.course_id}`}
          </Descriptions.Item>
          <Descriptions.Item label={t('teacherGrades.colSemester')}>
            {detail.semester}
          </Descriptions.Item>
          <Descriptions.Item label={t('teacherGrades.colExamType')}>
            {t(`teacherGrades.examType_${detail.exam_type}`)}
          </Descriptions.Item>
          <Descriptions.Item label={t('teacherGrades.colScore')}>{detail.score}</Descriptions.Item>
          <Descriptions.Item label={t('teacherGrades.remark')}>
            {detail.remark || '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('teacherGrades.createdAt')}>
            {formatDateTime(detail.created_at, locale)}
          </Descriptions.Item>
          <Descriptions.Item label={t('teacherGrades.updatedAt')}>
            {formatDateTime(detail.updated_at, locale)}
          </Descriptions.Item>
        </Descriptions>
      )}
      <Table<CourseScoreInfo>
        rowKey="id"
        size="small"
        loading={detailLoading}
        columns={columns}
        dataSource={scores}
        pagination={false}
        locale={{ emptyText: t('common.noData') }}
        scroll={{ x: 720 }}
        onRow={(record) => ({
          onClick: () => void openDetail(record.id),
          title: t('teacherGrades.scoreRowClickHint'),
          style: { cursor: 'pointer' },
        })}
      />
    </>
  )
}

export default function StudentScoresView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  // 当前登录用户 uid：用于解析所在组织
  const [uid, setUid] = useState<number | null>(null)
  const [uidError, setUidError] = useState<string | null>(null)
  const [uidLoading, setUidLoading] = useState(true)

  const loadMe = useCallback(async () => {
    setUidLoading(true)
    setUidError(null)
    try {
      setUid((await getCurrentUser()).uid)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setUidError(extractError(err))
      }
    } finally {
      setUidLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  // 老师所在的所有组织 + 组织内的学生（数据范围来源）
  const {
    orgs,
    students,
    loading: studentsLoading,
    error: studentsError,
    refresh,
  } = useOrgStudents(uid)

  // 组织筛选：'all' 表示不限组织，否则为所选组织 id
  const [orgFilter, setOrgFilter] = useState<'all' | number>('all')

  /** 组织筛选下拉项：老师所在的所有组织 */
  const orgOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('teacherGrades.filterOrgAll') },
      ...orgs.map((o) => ({ value: o.id, label: o.name })),
    ],
    [orgs, t],
  )

  /** 按所选组织筛选后的学生（同一学生跨多个组织时按各自组织各占一行） */
  const filteredStudents = useMemo(
    () =>
      orgFilter === 'all' ? students : students.filter((s) => s.organizationId === orgFilter),
    [students, orgFilter],
  )

  // 分页单位 = 学生：每页 20 人，只请求该页学生的成绩
  const [page, setPage] = useState(1)
  const [scoresByUid, setScoresByUid] = useState<Map<number, CourseScoreInfo[]>>(new Map())
  const [scoresLoading, setScoresLoading] = useState(false)
  const [scoresError, setScoresError] = useState<string | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)
  // 手动刷新标记：refresh 时置位，effect 消费后复位
  const forceRef = useRef(false)

  // 切换组织筛选或刷新数据后回到第一页
  useEffect(() => {
    setPage(1)
  }, [filteredStudents])

  // 所选组织在刷新后已不在老师的组织中时，回退为「全部组织」
  useEffect(() => {
    if (orgFilter !== 'all' && !orgs.some((o) => o.id === orgFilter)) setOrgFilter('all')
  }, [orgs, orgFilter])

  const pageStudents = useMemo(
    () =>
      filteredStudents.slice(
        (page - 1) * SCORE_STUDENT_PAGE_SIZE,
        page * SCORE_STUDENT_PAGE_SIZE,
      ),
    [filteredStudents, page],
  )

  // 拉取当前页学生的成绩：并发请求，单个学生失败不影响其他学生
  useEffect(() => {
    if (pageStudents.length === 0) {
      setScoresByUid(new Map())
      setScoresError(null)
      return
    }

    let cancelled = false
    const force = forceRef.current
    forceRef.current = false
    setScoresLoading(true)
    setScoresError(null)

    void (async () => {
      const next = new Map<number, CourseScoreInfo[]>()
      let failed = false
      await Promise.all(
        pageStudents.map(async (s) => {
          try {
            next.set(s.uid, await listAllScoresForUser(s.uid, force))
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 401) return
            failed = true
            next.set(s.uid, [])
          }
        }),
      )
      if (!cancelled) {
        setScoresByUid(next)
        setScoresError(failed ? 'failed' : null)
        setScoresLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pageStudents, reloadSeq])

  const doRefresh = useCallback(() => {
    forceRef.current = true
    refresh()
    setReloadSeq((s) => s + 1)
  }, [refresh])

  // 批量解析学生姓名（走会话缓存）
  const studentNames = useUserNames(useMemo(() => pageStudents.map((s) => s.uid), [pageStudents]))

  // 批量解析当前页所有成绩的课程名称（走会话缓存）
  const courseNames = useCourseNames(
    useMemo(() => {
      const ids: number[] = []
      for (const scores of scoresByUid.values()) {
        for (const s of scores) ids.push(s.course_id)
      }
      return ids
    }, [scoresByUid]),
  )

  /** 学生成绩统计：条数、平均分（算术平均）、不及格条数 */
  const statsOf = useCallback(
    (studentUid: number): StudentStat => {
      const scores = scoresByUid.get(studentUid) ?? []
      const failed = scores.filter((s) => !s.is_pass).length
      const sum = scores.reduce((acc, s) => {
        const value = Number(s.score)
        return acc + (Number.isFinite(value) ? value : 0)
      }, 0)
      return {
        count: scores.length,
        average: scores.length > 0 ? sum / scores.length : 0,
        failed,
      }
    },
    [scoresByUid],
  )

  const columns = useMemo<ColumnsType<OrgStudent>>(
    () => [
      {
        title: t('teacherGrades.colStudent'),
        dataIndex: 'uid',
        key: 'uid',
        width: 180,
        render: (studentUid: number) =>
          studentNames.has(studentUid)
            ? (studentNames.get(studentUid) ?? `#${studentUid}`)
            : t('common.loading'),
      },
      {
        title: t('teacherGrades.colOrganization'),
        dataIndex: 'organizationName',
        key: 'organizationName',
        width: 220,
        ellipsis: true,
        render: (name: string) => <span title={name}>{name}</span>,
      },
      {
        title: t('teacherGrades.colCount'),
        key: 'count',
        width: 110,
        align: 'center',
        render: (_, record) => statsOf(record.uid).count,
      },
      {
        title: t('teacherGrades.colAverage'),
        key: 'average',
        width: 110,
        align: 'center',
        render: (_, record) => {
          const stat = statsOf(record.uid)
          return stat.count > 0 ? stat.average.toFixed(1) : '—'
        },
      },
      {
        title: t('teacherGrades.colFailed'),
        key: 'failed',
        width: 110,
        align: 'center',
        render: (_, record) => {
          const stat = statsOf(record.uid)
          return stat.failed > 0 ? <Tag color="red">{stat.failed}</Tag> : '0'
        },
      },
    ],
    [t, studentNames, statsOf],
  )

  // 当前打开的「学生成绩明细」弹窗对应的学生
  const [detailStudent, setDetailStudent] = useState<OrgStudent | null>(null)

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / SCORE_STUDENT_PAGE_SIZE))
  const errorText = uidError ?? studentsError
  const loading = uidLoading || studentsLoading

  return (
    <div className="student-view">
     

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('teacherGrades.title')}</h3>
          <div className="student-toolbar">
            <Select<'all' | number>
              style={{ minWidth: 200 }}
              value={orgFilter}
              onChange={(v) => setOrgFilter(v)}
              options={orgOptions}
              loading={studentsLoading}
              placeholder={t('teacherGrades.filterOrgPlaceholder')}
            />
            <Button icon={<ReloadOutlined />} onClick={doRefresh} loading={loading}>
              {t('common.refresh')}
            </Button>
          </div>
        </header>
        <div className="panel-card-body">
          {errorText ? (
            <Alert
              type="error"
              showIcon
              title={
                errorText === 'network'
                  ? t('common.networkError')
                  : errorText === 'failed'
                    ? t('common.loadFailed')
                    : errorText
              }
              action={
                <Button
                  size="small"
                  onClick={() => {
                    void loadMe()
                    doRefresh()
                  }}
                >
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <>
              {scoresError && (
                <Alert
                  type="error"
                  showIcon
                  title={t('teacherGrades.scoresLoadFailed')}
                  style={{ marginBottom: 12 }}
                />
              )}
              <Table<OrgStudent>
                rowKey={(record) => `${record.organizationId}:${record.uid}`}
                loading={loading || scoresLoading}
                columns={columns}
                dataSource={pageStudents}
                locale={{
                  emptyText: loading ? t('teacherGrades.loadingStudents') : t('teacherGrades.emptyHint'),
                }}
                scroll={{ x: 720 }}
                pagination={{
                  current: page,
                  pageSize: SCORE_STUDENT_PAGE_SIZE,
                  total: filteredStudents.length,
                  showSizeChanger: false,
                  showQuickJumper: true,
                  showTotal: (n: number) =>
                    `${t('teacherGrades.totalStudents', { n })}，${t('teacherGrades.totalPages', { n: totalPages })}`,
                  onChange: (nextPage: number) => setPage(nextPage),
                }}
                onRow={(record) => ({
                  onClick: () => setDetailStudent(record),
                  title: t('teacherGrades.rowClickHint'),
                  style: { cursor: 'pointer' },
                })}
              />
            </>
          )}
        </div>
      </section>

      <Modal
        open={detailStudent !== null}
        title={t('teacherGrades.detailTitle')}
        width={880}
        footer={<Button onClick={() => setDetailStudent(null)}>{t('common.close')}</Button>}
        onCancel={() => setDetailStudent(null)}
        destroyOnHidden
      >
        {detailStudent && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
              <Descriptions.Item label={t('teacherGrades.colStudent')}>
                {studentNames.get(detailStudent.uid) ?? `#${detailStudent.uid}`}
              </Descriptions.Item>
              <Descriptions.Item label={t('teacherGrades.colOrganization')}>
                {detailStudent.organizationName}
              </Descriptions.Item>
              <Descriptions.Item label={t('teacherGrades.colCount')}>
                {statsOf(detailStudent.uid).count}
              </Descriptions.Item>
              <Descriptions.Item label={t('teacherGrades.colAverage')}>
                {statsOf(detailStudent.uid).count > 0
                  ? statsOf(detailStudent.uid).average.toFixed(1)
                  : '—'}
              </Descriptions.Item>
            </Descriptions>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {t('teacherGrades.scoreRowClickHint')}
            </Typography.Paragraph>
            <ScoreDetailTable
              scores={scoresByUid.get(detailStudent.uid) ?? []}
              courseNames={courseNames}
              t={t}
              locale={locale}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
