/**
 * 领导端：成员详情页（从「组织概览」点击成员行进入，渲染在 PortalWorkspace 布局壳内）。
 *
 * 四个 Tab：
 *   1. 基本信息：GET /api/users/{id}
 *   2. 成绩信息（可编辑）：GET /api/examinations?uid=成员 → 点击行编辑 → PATCH /api/examinations/{id}
 *   3. 请假信息：GET /api/approvals?applicant_id=成员 取审批实例 → GET /api/leaves/{id} 取详情
 *   4. 违规信息（查看详细 + 编辑）：GET /api/violations?user_id=成员 → GET/PATCH /api/violations/{id}
 *
 * 约定（ai 要求）：
 * - 表格每页最多 20 行，支持页码跳转与总数展示（要求 12）；
 * - 点击表格行查看详细信息（要求 14），编辑保存后刷新表格（要求 13）；
 * - 错误提示经 extractErrorWithStatus 附带 HTTP 状态码（要求 9），按钮/选项带悬停提示（要求 10）；
 * - 常量集中在 config/，文案走 i18n。
 */
import {
  ArrowLeftOutlined,
  BankOutlined,
  EditOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { queryApprovals, type ApprovalStepStatus } from '../../api/approvals'
import { extractErrorWithStatus } from '../../api/common'
import { listUserOrganizations, type UserOrganization } from '../../api/organizations'
import { getPosition, type PositionDetail } from '../../api/positions'
import { getRole, queryUserRoleRelations, type RoleInfo } from '../../api/rbac'
import {
  getScore,
  listAllScoresForUser,
  updateScore,
  type CourseScoreInfo,
  type ExamType,
} from '../../api/examinations'
import { getLeave, type LeaveDetail } from '../../api/leaves'
import { getUser, type UserDetail } from '../../api/users'
import {
  getViolation,
  queryViolations,
  updateViolation,
  type ViolationDto,
  type ViolationSeverity,
} from '../../api/violations'
import { useCourseDetails } from '../../composables/useCourseNames'
import {
  EXAM_TYPE_COLOR,
  EXAM_TYPE_ORDER,
  scoreColor,
} from '../../config/examination'
import { MEMBER_DETAIL_PAGE_SIZE } from '../../config/leaderOrg'
import { LEAVE_STATUS_COLOR, LEAVE_TYPE_COLOR } from '../../config/leave'
import {
  VIOLATION_CATEGORY_MAX_LENGTH,
  VIOLATION_DESC_MAX_LENGTH,
  VIOLATION_LOCATION_MAX_LENGTH,
  VIOLATION_PAGE_SIZE,
  VIOLATION_SEVERITY_COLOR,
  VIOLATION_SEVERITY_ORDER,
  VIOLATION_TITLE_MAX_LENGTH,
} from '../../config/violation'
import { useT, type TranslateFn } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** 成绩编辑表单值 */
interface ScoreFormValues {
  score: number
  is_pass: boolean
  exam_type: ExamType
  remark?: string
}

/** 违规编辑表单值 */
interface ViolationFormValues {
  title: string
  category: string
  description?: string
  location?: string
  occurred_at: Dayjs
  severity: ViolationSeverity
}

/** 请假列表项：详情 + 由审批步骤推导的状态 */
interface LeaveRow {
  detail: LeaveDetail
  status: ApprovalStepStatus
}

/** 组织任职项（含职位详情，职位接口异常时保留原始 code 兜底） */
interface OrgItem extends UserOrganization {
  positionDetail?: PositionDetail
}

const { Text } = Typography

/** 领导端成员详情页：4 个 Tab 汇总成员基本信息、成绩、请假与违规信息 */
export default function MemberDetailPage() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const navigate = useNavigate()
  const { portalKey, uid } = useParams<{ portalKey: string; uid: string }>()
  const userId = Number(uid)

  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUser = useCallback(async () => {
    if (!Number.isFinite(userId) || userId <= 0) {
      setError(t('common.loadFailed'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setUser(await getUser(userId))
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorWithStatus(err))
      }
    } finally {
      setLoading(false)
    }
  }, [userId, t])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  const backToList = () => navigate(`/portal/${portalKey}/leader_m3`)

  /** 性别文案（与个人资料页一致） */
  const genderLabel = useMemo(() => {
    switch (user?.gender) {
      case 'male':
        return t('profile.male')
      case 'female':
        return t('profile.female')
      default:
        return t('profile.unknown')
    }
  }, [user, t])

  return (
    <section className="panel-card" style={{ width: '100%' }}>
      <header className="panel-card-header">
        <h3 className="panel-card-title">
          {t('memberDetail.title')} · {user?.name ?? `#${userId}`}
        </h3>
        <Tooltip title={t('memberDetail.back')}>
          <Button icon={<ArrowLeftOutlined />} onClick={backToList}>
            {t('memberDetail.back')}
          </Button>
        </Tooltip>
      </header>
      <div className="panel-card-body">
        {error ? (
          <Alert
            type="error"
            showIcon
            title={error}
            action={
              <Button size="small" onClick={() => void loadUser()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <Tabs
            items={[
              {
                key: 'basic',
                label: t('memberDetail.tabBasic'),
                children: (
                  <BasicInfoPanel
                    user={user}
                    loading={loading}
                    genderLabel={genderLabel}
                    locale={locale}
                    t={t}
                  />
                ),
              },
              {
                key: 'grades',
                label: t('memberDetail.tabGrades'),
                children: <GradesTab uid={userId} t={t} />,
              },
              {
                key: 'leave',
                label: t('memberDetail.tabLeave'),
                children: <LeaveTab uid={userId} t={t} />,
              },
              {
                key: 'violation',
                label: t('memberDetail.tabViolation'),
                children: <ViolationTab uid={userId} t={t} />,
              },
            ]}
          />
        )}
      </div>
    </section>
  )
}

/** 基本信息面板：用户资料 + 系统角色 + 组织任职（角色/组织在本面板内按需加载） */
function BasicInfoPanel({
  user,
  loading,
  genderLabel,
  locale,
  t,
}: {
  user: UserDetail | null
  loading: boolean
  genderLabel: string
  locale: 'zh' | 'en'
  t: TranslateFn
}) {
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [orgs, setOrgs] = useState<OrgItem[]>([])
  const [extrasLoading, setExtrasLoading] = useState(false)
  const [extrasError, setExtrasError] = useState<string | null>(null)

  /** 并行加载角色关联与组织任职；单个角色/职位详情失败不影响整体 */
  const loadExtras = useCallback(async () => {
    if (!user) return
    setExtrasLoading(true)
    setExtrasError(null)
    try {
      const [relations, userOrgs] = await Promise.all([
        queryUserRoleRelations(user.id),
        listUserOrganizations(user.id),
      ])
      const roleItems = await Promise.all(
        relations.map(async (rel): Promise<RoleInfo | null> => {
          try {
            return await getRole(rel.role_id)
          } catch {
            return null
          }
        }),
      )
      const orgItems = await Promise.all(
        userOrgs.map(async (uo): Promise<OrgItem> => {
          if (!uo.position) return { ...uo }
          try {
            return { ...uo, positionDetail: await getPosition(uo.position) }
          } catch {
            return { ...uo }
          }
        }),
      )
      setRoles(roleItems.filter((r): r is RoleInfo => r !== null))
      setOrgs(orgItems)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setExtrasError(extractErrorWithStatus(err))
      }
    } finally {
      setExtrasLoading(false)
    }
  }, [user])

  useEffect(() => {
    void loadExtras()
  }, [loadExtras])

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />
  if (!user) return <Alert type="info" showIcon title={t('memberDetail.loadUserFailed')} />

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Descriptions
        bordered
        size="small"
        column={2}
        items={[
          { key: 'uid', label: t('memberDetail.fieldUid'), children: user.id },
          { key: 'name', label: t('profile.name'), children: user.name ?? t('profile.noData') },
          { key: 'gender', label: t('profile.gender'), children: genderLabel },
          { key: 'email', label: t('profile.email'), children: user.email ?? t('profile.noData') },
          { key: 'phone', label: t('profile.phone'), children: user.phone ?? t('profile.noData') },
          {
            key: 'birthday',
            label: t('profile.birthday'),
            children: user.birthday ?? t('profile.noData'),
          },
          {
            key: 'created_at',
            label: t('profile.createdAt'),
            children: formatDateTime(user.created_at, locale),
          },
          {
            key: 'updated_at',
            label: t('memberDetail.fieldUpdatedAt'),
            children: formatDateTime(user.updated_at, locale),
          },
        ]}
      />

      {/* 系统角色 */}
      <Card
        size="small"
        title={
          <Space>
            <TeamOutlined />
            {t('profile.rolesTitle')}
          </Space>
        }
      >
        {extrasError ? (
          <Alert type="error" showIcon title={extrasError} />
        ) : extrasLoading ? (
          <Skeleton active paragraph={{ rows: 1 }} />
        ) : roles.length === 0 ? (
          <Text type="secondary">{t('profile.noData')}</Text>
        ) : (
          <Space size={[8, 8]} wrap>
            {roles.map((role) => (
              <Tag key={role.id} color="blue">
                {role.name}
                {role.description ? (
                  <Text type="secondary" style={{ marginLeft: 4 }}>
                    ({role.description})
                  </Text>
                ) : null}
              </Tag>
            ))}
          </Space>
        )}
      </Card>

      {/* 组织任职（组织 + 职位 + 工作地点） */}
      <Card
        size="small"
        title={
          <Space>
            <BankOutlined />
            {t('profile.orgsTitle')}
          </Space>
        }
      >
        {extrasError ? (
          <Alert type="error" showIcon title={extrasError} />
        ) : extrasLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : orgs.length === 0 ? (
          <Text type="secondary">{t('profile.noData')}</Text>
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {orgs.map((uo) => (
              <Card key={uo.id} size="small" bordered style={{ background: 'transparent' }}>
                <Descriptions
                  column={2}
                  size="small"
                  items={[
                    {
                      key: 'organization',
                      label: t('profile.organization'),
                      children: uo.organization_name,
                    },
                    {
                      key: 'position',
                      label: t('profile.position'),
                      children: uo.positionDetail ? (
                        <Space>
                          <Tag color="geekblue">{uo.positionDetail.name}</Tag>
                          {uo.positionDetail.description ? (
                            <Text type="secondary" style={{ marginLeft: 4 }}>
                              {uo.positionDetail.description}
                            </Text>
                          ) : null}
                        </Space>
                      ) : uo.position ? (
                        <Tag color="default">{uo.position}</Tag>
                      ) : (
                        t('profile.noData')
                      ),
                    },
                    {
                      key: 'workplace',
                      label: t('profile.workplace'),
                      span: 2,
                      children: uo.workplace ?? t('profile.noData'),
                    },
                  ]}
                />
              </Card>
            ))}
          </Space>
        )}
      </Card>
    </Space>
  )
}

/** 成绩信息 Tab：展示成员全部成绩，点击行编辑（PATCH /api/examinations/{id}） */
function GradesTab({ uid, t }: { uid: number; t: TranslateFn }) {
  const { message } = AntdApp.useApp()

  const [scores, setScores] = useState<CourseScoreInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState({ seq: 0, force: false })

  const courseDetails = useCourseDetails(
    useMemo(() => scores.map((s) => s.course_id), [scores]),
  )

  const [editTarget, setEditTarget] = useState<CourseScoreInfo | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<ScoreFormValues>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setScores(await listAllScoresForUser(uid, reload.force))
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorWithStatus(err))
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, reload.seq, reload.force])

  useEffect(() => {
    void load()
  }, [load])

  /** 打开编辑弹窗：先用列表项回填（弹窗立即打开），再取成绩详情补齐备注 */
  const openEdit = useCallback(
    async (record: CourseScoreInfo) => {
      setEditTarget(record)
      form.setFieldsValue({
        score: Number(record.score),
        is_pass: record.is_pass,
        exam_type: record.exam_type,
        remark: '',
      })
      setEditLoading(true)
      try {
        const detail = await getScore(record.id, true)
        setEditTarget(detail)
        form.setFieldsValue({
          score: Number(detail.score),
          is_pass: detail.is_pass,
          exam_type: detail.exam_type,
          remark: detail.remark,
        })
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          message.error(extractErrorWithStatus(err))
        }
        setEditTarget(null)
      } finally {
        setEditLoading(false)
      }
    },
    [form, message],
  )

  const submit = async () => {
    const values = await form.validateFields()
    if (!editTarget) return
    setSaving(true)
    try {
      await updateScore(editTarget.id, {
        score: String(values.score),
        is_pass: values.is_pass,
        exam_type: values.exam_type,
        remark: values.remark ?? '',
      })
      message.success(t('memberDetail.scoreUpdateSuccess'))
      setEditTarget(null)
      // 保存后强制刷新，展示最新成绩（ai 要求 13）
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(extractErrorWithStatus(err))
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ColumnsType<CourseScoreInfo>>(
    () => [
      {
        title: t('teacherGrades.colCourse'),
        dataIndex: 'course_id',
        key: 'course_id',
        width: 200,
        ellipsis: true,
        render: (id: number) => {
          if (!courseDetails.has(id)) return t('common.loading')
          const name = courseDetails.get(id)?.course_name
          return <span title={name ?? undefined}>{name ?? `#${id}`}</span>
        },
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
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 100,
        render: (_, record) => (
          <Tooltip title={t('memberDetail.scoreEditHint')}>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => void openEdit(record)}
            >
              {t('memberDetail.edit')}
            </Button>
          </Tooltip>
        ),
      },
    ],
    [t, courseDetails, openEdit],
  )

  return (
    <>
      <div className="approval-toolbar" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.gradesRefreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button size="small" onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <Table<CourseScoreInfo>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={scores}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: (e: React.MouseEvent) => {
              const target = e.target as HTMLElement
              if (target.closest('button')) return
              void openEdit(record)
            },
            title: t('memberDetail.scoreEditHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: MEMBER_DETAIL_PAGE_SIZE,
            total: scores.length,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      <Modal
        open={editTarget !== null}
        title={t('memberDetail.editScore')}
        okText={t('memberDetail.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setEditTarget(null)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Spin spinning={editLoading}>
          {editTarget && (
            <Descriptions
              size="small"
              column={1}
              style={{ marginBottom: 12 }}
              items={[
                {
                  key: 'course',
                  label: t('teacherGrades.colCourse'),
                  children:
                    courseDetails.get(editTarget.course_id)?.course_name ??
                    `#${editTarget.course_id}`,
                },
                {
                  key: 'semester',
                  label: t('teacherGrades.colSemester'),
                  children: editTarget.semester,
                },
              ]}
            />
          )}
          <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item
              name="score"
              label={t('memberDetail.fieldScore')}
              rules={[
                { required: true, message: t('memberDetail.scoreRequired') },
                {
                  type: 'number',
                  min: 0,
                  max: 100,
                  message: t('memberDetail.scoreRange'),
                },
              ]}
            >
              <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="is_pass" label={t('memberDetail.fieldIsPass')} valuePropName="checked">
              <Switch
                checkedChildren={t('teacherGrades.pass')}
                unCheckedChildren={t('teacherGrades.fail')}
              />
            </Form.Item>
            <Form.Item name="exam_type" label={t('memberDetail.fieldExamType')}>
              <Select
                options={EXAM_TYPE_ORDER.map((v) => ({
                  value: v,
                  label: t(`teacherGrades.examType_${v}`),
                }))}
              />
            </Form.Item>
            <Form.Item name="remark" label={t('memberDetail.fieldRemark')}>
              <Input.TextArea rows={3} maxLength={500} showCount />
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </>
  )
}

/** 请假信息 Tab：审批实例 → 请假详情，点击行查看请假详情 */
function LeaveTab({ uid, t }: { uid: number; t: TranslateFn }) {
  const locale = useSettingsStore((s) => s.locale)
  const [rows, setRows] = useState<LeaveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reloadSeq, setReloadSeq] = useState(0)
  const [detail, setDetail] = useState<LeaveRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const steps = await queryApprovals({ applicant_id: uid })
      // 每个审批实例取 step_order 最大的步骤状态作为该请假的当前状态
      const statusByInstance = new Map<number, { order: number; status: ApprovalStepStatus }>()
      for (const s of steps) {
        const cur = statusByInstance.get(s.instance_id)
        if (!cur || s.step_order >= cur.order) {
          statusByInstance.set(s.instance_id, { order: s.step_order, status: s.status })
        }
      }
      const ids = [...statusByInstance.keys()]
      const results = await Promise.all(
        ids.map(async (instanceId): Promise<LeaveRow | null> => {
          try {
            const d = await getLeave(instanceId)
            return { detail: d, status: statusByInstance.get(instanceId)!.status }
          } catch {
            // 非请假类型的审批实例查询详情会失败，跳过即可
            return null
          }
        }),
      )
      setRows(results.filter((r): r is LeaveRow => r !== null))
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorWithStatus(err))
      }
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    void load()
  }, [load, reloadSeq])

  const columns = useMemo<ColumnsType<LeaveRow>>(
    () => [
      {
        title: t('leave.colType'),
        key: 'leave_type',
        width: 120,
        render: (_, r) => (
          <Tag color={LEAVE_TYPE_COLOR[r.detail.leave_type]}>
            {t(`leave.type_${r.detail.leave_type}`)}
          </Tag>
        ),
      },
      {
        title: t('leave.colStart'),
        key: 'start_time',
        width: 170,
        render: (_, r) => formatDateTime(r.detail.start_time, locale),
      },
      {
        title: t('leave.colEnd'),
        key: 'end_time',
        width: 170,
        render: (_, r) => formatDateTime(r.detail.end_time, locale),
      },
      {
        title: t('approval.colStatus'),
        key: 'status',
        width: 110,
        render: (_, r) => (
          <Tag color={LEAVE_STATUS_COLOR[r.status]}>{t(`approval.status_${r.status}`)}</Tag>
        ),
      },
      {
        title: t('leaveDetail.reason'),
        dataIndex: ['detail', 'reason'],
        key: 'reason',
        ellipsis: true,
        render: (v: string) => <span title={v}>{v || '—'}</span>,
      },
    ],
    [t, locale],
  )

  return (
    <>
      <div className="approval-toolbar" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.refreshHint')}>
          <Button icon={<ReloadOutlined />} onClick={() => setReloadSeq((s) => s + 1)}>
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button size="small" onClick={() => setReloadSeq((s) => s + 1)}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <Table<LeaveRow>
          rowKey={(r) => r.detail.id}
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: () => setDetail(record),
            title: t('approval.rowClickHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: MEMBER_DETAIL_PAGE_SIZE,
            total: rows.length,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      <Modal
        open={detail !== null}
        title={t('leaveDetail.title')}
        footer={<Button onClick={() => setDetail(null)}>{t('common.close')}</Button>}
        onCancel={() => setDetail(null)}
        destroyOnHidden
      >
        {detail && (
          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              { key: 'uid', label: t('leaveDetail.applicantId'), children: detail.detail.user_id },
              {
                key: 'type',
                label: t('leaveDetail.leaveType'),
                children: t(`leave.type_${detail.detail.leave_type}`),
              },
              {
                key: 'status',
                label: t('approval.colStatus'),
                children: (
                  <Tag color={LEAVE_STATUS_COLOR[detail.status]}>
                    {t(`approval.status_${detail.status}`)}
                  </Tag>
                ),
              },
              { key: 'reason', label: t('leaveDetail.reason'), children: detail.detail.reason || '—' },
              {
                key: 'start',
                label: t('leaveDetail.startTime'),
                children: formatDateTime(detail.detail.start_time, locale),
              },
              {
                key: 'end',
                label: t('leaveDetail.endTime'),
                children: formatDateTime(detail.detail.end_time, locale),
              },
              {
                key: 'destination',
                label: t('leaveDetail.destination'),
                children: detail.detail.destination || '—',
              },
              {
                key: 'parent',
                label: t('leaveDetail.parentConfirm'),
                children: detail.detail.parent_confirm
                  ? t('leaveDetail.confirmed')
                  : t('leaveDetail.notConfirmed'),
              },
              {
                key: 'created_at',
                label: t('leaveDetail.createdAt'),
                children: formatDateTime(detail.detail.created_at, locale),
              },
            ]}
          />
        )}
      </Modal>
    </>
  )
}

/** 违规信息 Tab：分页展示成员违规记录，点击行查看详细，支持编辑（PATCH /api/violations/{id}） */
function ViolationTab({ uid, t }: { uid: number; t: TranslateFn }) {
  const { message } = AntdApp.useApp()
  const locale = useSettingsStore((s) => s.locale)

  const [list, setList] = useState<ViolationDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [reload, setReload] = useState({ seq: 0, force: false })

  const [detail, setDetail] = useState<ViolationDto | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editTarget, setEditTarget] = useState<ViolationDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<ViolationFormValues>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await queryViolations(
        { user_id: uid, page, page_size: VIOLATION_PAGE_SIZE },
        reload.force,
      )
      setList(res.data)
      setTotal(res.total)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorWithStatus(err))
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, page, reload.seq, reload.force])

  useEffect(() => {
    void load()
  }, [load])

  /** 点击行：拉取该条违规详情（GET /api/violations/{id}） */
  const openDetail = useCallback(async (id: number) => {
    setDetailLoading(true)
    try {
      setDetail(await getViolation(id, true))
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        message.error(extractErrorWithStatus(err))
      }
    } finally {
      setDetailLoading(false)
    }
  }, [message])

  /** 打开编辑弹窗（列表项即完整详情，直接回填） */
  const openEdit = useCallback(
    (record: ViolationDto) => {
      setEditTarget(record)
      form.setFieldsValue({
        title: record.title,
        category: record.category,
        description: record.description ?? undefined,
        location: record.location ?? undefined,
        occurred_at: dayjs(record.occurred_at),
        severity: record.severity,
      })
    },
    [form],
  )

  const submit = async () => {
    const values = await form.validateFields()
    if (!editTarget) return
    setSaving(true)
    try {
      await updateViolation(editTarget.id, {
        title: values.title.trim(),
        category: values.category.trim(),
        description: values.description ?? '',
        location: values.location ?? '',
        occurred_at: values.occurred_at.toISOString(),
        severity: values.severity,
      })
      message.success(t('memberDetail.violationUpdateSuccess'))
      setEditTarget(null)
      // 保存后强制刷新，展示最新数据（ai 要求 13）
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(extractErrorWithStatus(err))
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ColumnsType<ViolationDto>>(
    () => [
      { title: t('memberDetail.colCategory'), dataIndex: 'category', key: 'category', width: 130 },
      {
        title: t('memberDetail.colTitle'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
        render: (v: string) => <span title={v}>{v}</span>,
      },
      {
        title: t('memberDetail.colSeverity'),
        dataIndex: 'severity',
        key: 'severity',
        width: 120,
        render: (v: ViolationSeverity) => (
          <Tag color={VIOLATION_SEVERITY_COLOR[v]}>{t(`memberDetail.severity_${v}`)}</Tag>
        ),
      },
      {
        title: t('memberDetail.colOccurredAt'),
        dataIndex: 'occurred_at',
        key: 'occurred_at',
        width: 170,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('memberDetail.colLocation'),
        dataIndex: 'location',
        key: 'location',
        width: 160,
        render: (v: string | null) => v || '—',
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 100,
        render: (_, record) => (
          <Tooltip title={t('memberDetail.editViolation')}>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            >
              {t('memberDetail.edit')}
            </Button>
          </Tooltip>
        ),
      },
    ],
    [t, locale, openEdit],
  )

  return (
    <>
      <div className="approval-toolbar" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.violationRefreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          title={error}
          action={
            <Button size="small" onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <Table<ViolationDto>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={list}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: (e: React.MouseEvent) => {
              const target = e.target as HTMLElement
              if (target.closest('button')) return
              void openDetail(record.id)
            },
            title: t('memberDetail.violationRowClickHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: VIOLATION_PAGE_SIZE,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      {/* 违规详情：点击行查看（ai 要求 14） */}
      <Modal
        open={detail !== null}
        title={t('memberDetail.violationDetailTitle')}
        onCancel={() => setDetail(null)}
        footer={[
          <Button
            key="edit"
            type="primary"
            icon={<EditOutlined />}
            onClick={() => {
              if (detail) openEdit(detail)
              setDetail(null)
            }}
          >
            {t('memberDetail.edit')}
          </Button>,
          <Button key="close" onClick={() => setDetail(null)}>
            {t('common.close')}
          </Button>,
        ]}
        destroyOnHidden
      >
        {detailLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : detail ? (
          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              { key: 'id', label: t('common.id'), children: detail.id },
              { key: 'category', label: t('memberDetail.colCategory'), children: detail.category },
              { key: 'title', label: t('memberDetail.colTitle'), children: detail.title },
              {
                key: 'severity',
                label: t('memberDetail.colSeverity'),
                children: (
                  <Tag color={VIOLATION_SEVERITY_COLOR[detail.severity]}>
                    {t(`memberDetail.severity_${detail.severity}`)}
                  </Tag>
                ),
              },
              {
                key: 'occurred_at',
                label: t('memberDetail.colOccurredAt'),
                children: formatDateTime(detail.occurred_at, locale),
              },
              {
                key: 'location',
                label: t('memberDetail.colLocation'),
                children: detail.location || '—',
              },
              {
                key: 'description',
                label: t('memberDetail.colDescription'),
                children: detail.description || '—',
              },
              {
                key: 'recorder',
                label: t('memberDetail.fieldRecorder'),
                children: detail.recorder_id,
              },
              {
                key: 'updated_at',
                label: t('memberDetail.fieldUpdatedAt'),
                children: formatDateTime(detail.updated_at, locale),
              },
            ]}
          />
        ) : null}
      </Modal>

      {/* 违规编辑 */}
      <Modal
        open={editTarget !== null}
        title={t('memberDetail.editViolation')}
        okText={t('memberDetail.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setEditTarget(null)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="title"
            label={t('memberDetail.fieldTitle')}
            rules={[{ required: true, message: t('memberDetail.titleRequired') }]}
          >
            <Input maxLength={VIOLATION_TITLE_MAX_LENGTH} showCount />
          </Form.Item>
          <Form.Item
            name="category"
            label={t('memberDetail.fieldCategory')}
            rules={[{ required: true, message: t('memberDetail.categoryRequired') }]}
          >
            <Input maxLength={VIOLATION_CATEGORY_MAX_LENGTH} />
          </Form.Item>
          <Form.Item
            name="severity"
            label={t('memberDetail.colSeverity')}
            rules={[{ required: true }]}
          >
            <Select
              options={VIOLATION_SEVERITY_ORDER.map((v) => ({
                value: v,
                label: t(`memberDetail.severity_${v}`),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="occurred_at"
            label={t('memberDetail.fieldOccurredAt')}
            rules={[{ required: true, message: t('memberDetail.occurredAtRequired') }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label={t('memberDetail.fieldLocation')}>
            <Input maxLength={VIOLATION_LOCATION_MAX_LENGTH} />
          </Form.Item>
          <Form.Item name="description" label={t('memberDetail.fieldDescription')}>
            <Input.TextArea rows={3} maxLength={VIOLATION_DESC_MAX_LENGTH} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
