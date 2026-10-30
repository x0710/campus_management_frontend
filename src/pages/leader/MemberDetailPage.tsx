/**
 * 成员详情页（领导端「组织概览」、老师端「班级管理」、党委各端支部管理、
 * 管理端「组织架构」与党委学校端「组织管理」共用，渲染在 PortalWorkspace 布局壳内）。
 *
 * 入口与来源：?from=<moduleKey>（leader_m3 / teacher_m3 / branch_m5 / academy_m5 /
 * admin_m1 / admin_m3 / school_m2），决定「返回」目标与侧栏高亮；
 * 来自只读来源（见 MEMBER_DETAIL_READONLY_FROM_MODULES，如老师端）时隐藏成绩/违规编辑入口，
 * 仅提供查询；来自具备用户管理权限的来源（见 MEMBER_DETAIL_BASIC_EDIT_FROM_MODULES，
 * 管理端用户与账户 admin_m1 / 管理端组织架构 admin_m3 / 党委学校端 school_m2）时
 * 在「基本信息」页额外提供「编辑成员信息」入口，复用 admin/UserEditPanel 修改资料、角色与组织任职。
 *
 * 六个 Tab（党委支部端 / 学院端 / 学校端的组织管理只保留前两个，
 * 见 MEMBER_DETAIL_HIDDEN_EXTRA_TABS_FROM_MODULES）：
 *   1. 基本信息：GET /api/users/{id}（可编辑来源另提供资料/角色/组织任职编辑）
 *      （党委支部端 / 学院端 / 学校端额外展示「党员信息」卡片：党员编号、所属支部、
 *       政治面貌、入党时间，与党员端「我的」页展示口径一致）
 *   2. 详细信息：GET /api/profile-details?user_id=成员
 *      （党委支部端 / 学院端 / 学校端不展示该 Tab，见 MEMBER_DETAIL_PARTY_SCORE_FROM_MODULES）
 *   3. 成绩信息（可编辑）：GET /api/examinations?uid=成员 → 点击行编辑 → PATCH /api/examinations/{id}
 *      （党委支部端 / 学院端 / 学校端改为「获得加分总数」= 基础分 70 + 党建活动加分，
 *       并分页展示该成员全部加分申请 GET /api/party-scores?user_id=成员）
 *   4. 请假信息：GET /api/approvals?applicant_id=成员 取审批实例 → GET /api/leaves/{id} 取详情
 *   5. 违规信息（查看详细 + 编辑）：GET /api/violations?user_id=成员 → GET/PATCH /api/violations/{id}
 *   6. 奖学金及补助：GET /api/rewardings?uid=成员（只读）
 *
 * 约定（代码要求）：
 * - 表格每页最多 100 行，支持页码跳转与总数展示（要求 12）；
 * - 点击表格行查看详细信息（要求 14），编辑保存后刷新表格（要求 13）；
 * - 错误提示经 extractErrorReason 附带 HTTP 状态码与中文原因（要求 9），按钮/选项带悬停提示（要求 10）；
 * - 常量集中在 config/，文案走 i18n。
 */
import {
  ArrowLeftOutlined,
  BankOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Avatar,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
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
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { queryApprovals } from '../../api/approvals'
import type { ApprovalStepStatus } from '../../api/types/approvals'
import { extractErrorReason } from '../../api/common'
import { listAllOrganizations, listUserOrganizations } from '../../api/organizations'
import type {
  OrganizationInfo,
  UserOrganization,
} from '../../api/types/organizations'
import { getPosition, queryPositions } from '../../api/positions'
import type { PositionDetail } from '../../api/types/positions'
import { getRole, queryRoles, queryUserRoleRelations } from '../../api/rbac'
import type { RoleInfo } from '../../api/types/rbac'
import {
  getScore,
  listAllScoresForUser,
  updateScore,
} from '../../api/examinations'
import type { CourseScoreInfo, ExamType } from '../../api/types/examinations'
import { getLeave } from '../../api/leaves'
import type { LeaveDetail } from '../../api/types/leaves'
import {
  createProfileDetail,
  deleteProfileDetail,
  queryProfileDetails,
  updateProfileDetail,
} from '../../api/profileDetails'
import type { ProfileDetail } from '../../api/types/profileDetails'
import {
  getPartyScore,
  getPartyScoreTotals,
  hydratePartyScoreRows,
  queryPartyScores,
} from '../../api/partyScores'
import type { PartyScore, PartyScoreDetail } from '../../api/types/partyScores'
import PartyScoreApprovalRecords from '../../components/PartyScoreApprovalRecords'
import { getUser } from '../../api/users'
import type { UserDetail } from '../../api/types/users'
import {
  createRewarding,
  deleteRewarding,
  queryRewardings,
  updateRewarding,
} from '../../api/rewardings'
import type { RewardingDto } from '../../api/types/rewardings'
import {
  getViolation,
  queryViolations,
  updateViolation,
} from '../../api/violations'
import type {
  ViolationDto,
  ViolationSeverity,
} from '../../api/types/violations'
import { useCourseDetails } from '../../composables/useCourseNames'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { usePositionNames } from '../../composables/usePositionNames'
import {
  EXAM_TYPE_COLOR,
  EXAM_TYPE_ORDER,
  scoreColor,
} from '../../config/examination'
import {
  MEMBER_DETAIL_BASIC_EDIT_FROM_MODULES,
  MEMBER_DETAIL_HIDDEN_EXTRA_TABS_FROM_MODULES,
  MEMBER_DETAIL_PAGE_SIZE,
  MEMBER_DETAIL_PARTY_SCORE_FROM_MODULES,
  MEMBER_DETAIL_READONLY_FROM_MODULES,
} from '../../config/leaderOrg'
import { LEAVE_STATUS_COLOR, LEAVE_TYPE_COLOR } from '../../config/leave'
import { PARTY_SCORE_BASE } from '../../config/partyDeclaration'
import { PARTY_POLITICAL_STATUS_NAMES } from '../../config/partyProfile'
import {
  REWARDING_AMOUNT_MAX_YUAN,
  REWARDING_AMOUNT_MIN_YUAN,
  REWARDING_AMOUNT_STEP_YUAN,
  REWARDING_PROJECT_MAX_LENGTH,
} from '../../config/rewarding'
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
import { formatCentsAsYuan, yuanToCents } from '../../utils/money'
import { formatPartyScore, isNegativePartyScore } from '../../utils/partyScore'
import ErrorState from '../../components/ErrorState'
import UserEditPanel, { type EditSection } from '../admin/UserEditPanel'

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

/** 详细信息新增/编辑表单值（user_id 由当前成员固定，不参与用户输入） */
interface ProfileFormValues {
  user_id: number
  id_card: string
  ethnic: string
  birth_date: Dayjs
  class_id: number
  native_place?: string
  household_location?: string
  household_type?: string
  phone?: string
  email?: string
  father_name?: string
  father_phone?: string
  father_company?: string
  mother_name?: string
  mother_phone?: string
  mother_company?: string
}

/** 奖学金及补助新增/编辑表单值（uid 固定为当前成员；金额以「元」输入） */
interface RewardingFormValues {
  project: string
  amount_yuan: number
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

/** 共享成员详情页：6 个 Tab 汇总成员基本信息、详细信息、成绩、请假、违规与奖助信息 */
export default function MemberDetailPage() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const reportError = useErrorFeedback()
  const navigate = useNavigate()
  const { portalKey, uid } = useParams<{ portalKey: string; uid: string }>()
  const [searchParams] = useSearchParams()
  // 来源模块（侧栏高亮 + 返回目标）：领导端组织概览 leader_m3 / 老师端班级管理 teacher_m3 /
  // 党委支部端 branch_m5 / 学院端 academy_m5 / 管理端 admin_m3 / 党委学校端 school_m2
  const fromModuleKey = searchParams.get('from') ?? 'leader_m3'
  // 只读来源（如老师端班级管理）隐藏成绩/违规编辑入口，避免无权限操作（错误处理只作兜底）
  const readOnly = MEMBER_DETAIL_READONLY_FROM_MODULES.includes(fromModuleKey)
  // 可编辑成员资料的来源（管理端 / 党委学校端）在「基本信息」页展示编辑入口
  const canEditBasic = MEMBER_DETAIL_BASIC_EDIT_FROM_MODULES.includes(fromModuleKey)
  // 党委支部端 / 学院端 / 学校端的组织管理不需要请假、违规与奖助信息
  const hideExtraTabs = MEMBER_DETAIL_HIDDEN_EXTRA_TABS_FROM_MODULES.includes(fromModuleKey)
  // 党委支部端 / 学院端 / 学校端：不展示「详细信息」，并把「成绩信息」替换为
  // 「获得加分总数（基础分 70 + 党建活动加分）+ 该成员全部加分申请」
  const partyScoreView = MEMBER_DETAIL_PARTY_SCORE_FROM_MODULES.includes(fromModuleKey)
  const userId = Number(uid)

  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 成员信息编辑弹窗（复用 admin/UserEditPanel）：null 表示关闭
  // 资料 / 系统角色 / 组织任职拆成三个独立入口，一个弹窗只编辑一个部分（每次打开时按区块重新挂载）
  const [editSection, setEditSection] = useState<EditSection | null>(null)
  const [editRefs, setEditRefs] = useState<{
    roles: RoleInfo[]
    organizations: OrganizationInfo[]
    positions: PositionDetail[]
  } | null>(null)

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
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
  }, [userId, t])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  // 打开指定区块的编辑弹窗：首次打开时并行拉取角色/职位/组织选项（均走会话缓存），失败仅提示不阻塞
  const openEdit = useCallback(
    async (section: EditSection) => {
      setEditSection(section)
      if (editRefs) return
      try {
        const [roleRes, posRes, orgList] = await Promise.all([
          queryRoles({ page: 1, page_size: 100 }),
          queryPositions({ page: 1, page_size: 100 }),
          listAllOrganizations(),
        ])
        setEditRefs({
          roles: roleRes.data,
          positions: posRes.data,
          organizations: orgList,
        })
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          reportError(err)
          setEditSection(null)
        }
      }
    },
    [editRefs, reportError],
  )

  const backToList = () => navigate(`/portal/${portalKey}/${fromModuleKey}`)

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
    // 数据展示页固定布局：成员标题/返回固定，仅各 Tab 数据区在卡片体内滚动（代码要求 23）
    <div className="data-page-view">
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
          <ErrorState message={error} onRetry={() => void loadUser()} />
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
                    canEdit={canEditBasic}
                    showPartyInfo={partyScoreView}
                    onEdit={(section) => void openEdit(section)}
                  />
                ),
              },
              ...(partyScoreView
                ? []
                : [
                    {
                      key: 'profile',
                      label: t('memberDetail.tabProfile'),
                      children: (
                        <ProfileDetailTab uid={userId} locale={locale} t={t} readOnly={readOnly} />
                      ),
                    },
                  ]),
              {
                key: 'grades',
                label: partyScoreView
                  ? t('memberDetail.tabPartyScoreTotal')
                  : t('memberDetail.tabGrades'),
                children: partyScoreView ? (
                  <PartyScoreTab uid={userId} locale={locale} t={t} />
                ) : (
                  <GradesTab uid={userId} t={t} readOnly={readOnly} />
                ),
              },
              ...(hideExtraTabs
                ? []
                : [
                    {
                      key: 'leave',
                      label: t('memberDetail.tabLeave'),
                      children: <LeaveTab uid={userId} t={t} />,
                    },
                    {
                      key: 'violation',
                      label: t('memberDetail.tabViolation'),
                      children: <ViolationTab uid={userId} t={t} readOnly={readOnly} />,
                    },
                    {
                      key: 'rewarding',
                      label: t('memberDetail.tabRewarding'),
                      children: (
                        <RewardingTab uid={userId} t={t} locale={locale} readOnly={readOnly} />
                      ),
                    },
                  ]),
            ]}
          />
        )}
      </div>

      {/* 成员信息编辑（管理端用户与账户 / 组织架构、党委学校端等具备用户管理权限的来源）：
          复用 admin/UserEditPanel，资料 / 系统角色 / 组织任职三个区块各自独立入口，一个弹窗只编辑一个部分 */}
      <Modal
        open={editSection !== null}
        title={
          editSection === 'profile'
            ? t('memberDetail.editBasicTitle', { name: user?.name ?? `#${userId}` })
            : editSection === 'roles'
              ? t('memberDetail.editRolesTitle', { name: user?.name ?? `#${userId}` })
              : t('memberDetail.editOrgsTitle', { name: user?.name ?? `#${userId}` })
        }
        width={editSection === 'roles' ? 560 : 720}
        footer={null}
        onCancel={() => setEditSection(null)}
        destroyOnHidden
      >
        {editRefs ? (
          <UserEditPanel
            uid={userId}
            roles={editRefs.roles}
            organizations={editRefs.organizations}
            positions={editRefs.positions}
            section={editSection ?? undefined}
            // 任一区块保存后刷新页面上的基本信息与（基本信息面板内的）角色/组织任职展示
            onChanged={() => void loadUser()}
          />
        ) : (
          <Skeleton active paragraph={{ rows: 6 }} />
        )}
      </Modal>
      </section>
    </div>
  )
}

/** 基本信息面板：用户资料 + 党员信息（部分来源）+ 系统角色 + 组织任职（角色/组织在本面板内按需加载） */
function BasicInfoPanel({
  user,
  loading,
  genderLabel,
  locale,
  t,
  canEdit,
  showPartyInfo,
  onEdit,
}: {
  user: UserDetail | null
  loading: boolean
  genderLabel: string
  locale: 'zh' | 'en'
  t: TranslateFn
  /** 是否展示编辑入口（管理端 / 党委学校端等来源为 true） */
  canEdit: boolean
  /** 是否展示「党员信息」卡片（党委支部端 / 学院端 / 学校端为 true，口径同党员端「我的」） */
  showPartyInfo: boolean
  /** 打开指定区块的编辑弹窗（复用 admin/UserEditPanel；一次只编辑一个部分） */
  onEdit: (section: EditSection) => void
}) {
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [orgs, setOrgs] = useState<OrgItem[]>([])
  const [extrasLoading, setExtrasLoading] = useState(false)
  const [extrasError, setExtrasError] = useState<string | null>(null)
  // 职位详情接口不可用时的兜底映射：编码 → 名称（未命中仍显示编码）
  const positionNames = usePositionNames()

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
        setExtrasError(extractErrorReason(err, t))
      }
    } finally {
      setExtrasLoading(false)
    }
  }, [user, t])

  useEffect(() => {
    void loadExtras()
  }, [loadExtras])

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />
  if (!user) return <Alert type="info" showIcon title={t('memberDetail.loadUserFailed')} />

  // 党员信息（党委支部端 / 学院端 / 学校端）：展示口径与党员端「我的」页一致。
  // 所属支部取第一项任职组织；政治面貌取任职职位名中的党员身份（书记等其他职位忽略）；
  // 党员编号 / 入党时间后端暂无接口，统一显示「暂无数据」。
  const positionNameOf = (uo: OrgItem): string =>
    (uo.positionDetail?.name ?? (uo.position ? positionNames.get(uo.position) : '') ?? '').trim()
  const partyBranch =
    orgs.map((uo) => uo.organization_name?.trim() ?? '').find((name) => name.length > 0) ??
    t('common.noData')
  const politicalStatus = orgs
    .map(positionNameOf)
    .find((name) => PARTY_POLITICAL_STATUS_NAMES.includes(name))

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 具备用户管理权限的来源（管理端 / 党委学校端）提供三个独立编辑入口：
          基本信息（资料卡片上方工具栏）、系统角色与组织任职（各自卡片右上角） */}
      {canEdit && (
        <div className="approval-toolbar approval-toolbar-right">
          <Tooltip title={t('memberDetail.editBasicHint')}>
            <Button type="primary" icon={<EditOutlined />} onClick={() => onEdit('profile')}>
              {t('memberDetail.editBasic')}
            </Button>
          </Tooltip>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'stretch',
          width: '100%',
        }}
      >
        {/* 头像（avatar 为图片地址），与党员端「我的」/ 学生端个人信息展示一致 */}
        <Card size="small" title={t('profile.avatar')} style={{ flex: '0 0 168px' }}>
          {user.avatar && user.avatar.trim() ? (
            <Avatar shape="square" size={96} src={user.avatar} />
          ) : (
            <Avatar shape="square" size={96} icon={<UserOutlined />} />
          )}
        </Card>
        <Card
          size="small"
          title={t('profile.basicInfo')}
          style={{ flex: '1 1 480px', minWidth: 0 }}
        >
          <Descriptions
            bordered
            size="small"
            column={2}
            items={[
              { key: 'uid', label: t('memberDetail.fieldUid'), children: user.id },
              { key: 'name', label: t('profile.name'), children: user.name ?? t('profile.noData') },
              { key: 'gender', label: t('profile.gender'), children: genderLabel },
              {
                key: 'email',
                label: t('profile.email'),
                children: user.email ?? t('profile.noData'),
              },
              {
                key: 'phone',
                label: t('profile.phone'),
                children: user.phone ?? t('profile.noData'),
              },
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
        </Card>
      </div>

      {/* 党员信息（党委支部端 / 学院端 / 学校端）：与党员端「我的」页展示一致的党员端扩展信息 */}
      {showPartyInfo && (
        <Card size="small" title={t('partyProfile.partyInfoTitle')}>
          {extrasLoading ? (
            <Skeleton active paragraph={{ rows: 1 }} />
          ) : (
            <Descriptions
              bordered
              size="small"
              column={2}
              items={[
                {
                  key: 'member_no',
                  label: t('partyProfile.fieldMemberNo'),
                  children: t('common.noData'),
                },
                {
                  key: 'branch',
                  label: t('partyProfile.fieldBranch'),
                  children: partyBranch,
                },
                {
                  key: 'political_status',
                  label: t('partyProfile.fieldPoliticalStatus'),
                  children: politicalStatus ?? t('partyProfile.politicalNotFound'),
                },
                {
                  key: 'join_date',
                  label: t('partyProfile.fieldJoinDate'),
                  children: t('common.noData'),
                },
              ]}
            />
          )}
        </Card>
      )}

      {/* 系统角色（编辑入口置于卡片右上角） */}
      <Card
        size="small"
        title={
          <Space>
            <TeamOutlined />
            {t('profile.rolesTitle')}
          </Space>
        }
        extra={
          canEdit ? (
            <Tooltip title={t('memberDetail.editRolesHint')}>
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEdit('roles')}
              >
                {t('memberDetail.editRoles')}
              </Button>
            </Tooltip>
          ) : undefined
        }
      >
        {extrasError ? (
          <ErrorState message={extrasError} />
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

      {/* 组织任职（组织 + 职位 + 工作地点；编辑入口置于卡片右上角） */}
      <Card
        size="small"
        title={
          <Space>
            <BankOutlined />
            {t('profile.orgsTitle')}
          </Space>
        }
        extra={
          canEdit ? (
            <Tooltip title={t('memberDetail.editOrgsHint')}>
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEdit('organizations')}
              >
                {t('memberDetail.editOrgs')}
              </Button>
            </Tooltip>
          ) : undefined
        }
      >
        {extrasError ? (
          <ErrorState message={extrasError} />
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
                        <Tag color="default">
                          {positionNames.get(uo.position) ?? uo.position}
                        </Tag>
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

/**
 * 详细信息面板：读取 /api/profile-details 中该用户的档案详情。
 * 非只读来源（管理端 / 党委学校端）支持新增（无档案时）、编辑与删除档案；
 * readOnly=true（如老师端班级管理进入）时隐藏以上入口，仅作查询。
 */
function ProfileDetailTab({
  uid,
  locale,
  t,
  readOnly,
}: {
  uid: number
  locale: 'zh' | 'en'
  t: TranslateFn
  readOnly: boolean
}) {
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const [profile, setProfile] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState({ seq: 0, force: false })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProfileDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form] = Form.useForm<ProfileFormValues>()

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await queryProfileDetails(
        { user_id: uid, page: 1, page_size: 20 },
        reload.force,
      )
      setProfile(res.data[0] ?? null)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, reload.seq, reload.force])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  /** 打开「新增」弹窗：user_id 固定为当前成员 */
  const openCreate = useCallback(() => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ user_id: uid })
    setModalOpen(true)
  }, [form, uid])

  /** 打开「编辑」弹窗：回填已有档案 */
  const openEdit = useCallback(
    (record: ProfileDetail) => {
      setEditing(record)
      form.setFieldsValue({
        user_id: record.user_id,
        id_card: record.id_card,
        ethnic: record.ethnic,
        birth_date: dayjs(record.birth_date),
        class_id: record.class_id,
        native_place: record.native_place ?? undefined,
        household_location: record.household_location ?? undefined,
        household_type: record.household_type ?? undefined,
        phone: record.phone ?? undefined,
        email: record.email ?? undefined,
        father_name: record.father_name ?? undefined,
        father_phone: record.father_phone ?? undefined,
        father_company: record.father_company ?? undefined,
        mother_name: record.mother_name ?? undefined,
        mother_phone: record.mother_phone ?? undefined,
        mother_company: record.mother_company ?? undefined,
      })
      setModalOpen(true)
    },
    [form],
  )

  /** 由表单值构造请求体（可选字段空串统一转 null） */
  const buildBody = (values: ProfileFormValues) => ({
    id_card: values.id_card.trim(),
    ethnic: values.ethnic.trim(),
    birth_date: values.birth_date.format('YYYY-MM-DD'),
    class_id: values.class_id,
    native_place: values.native_place?.trim() || null,
    household_location: values.household_location?.trim() || null,
    household_type: values.household_type?.trim() || null,
    phone: values.phone?.trim() || null,
    email: values.email?.trim() || null,
    father_name: values.father_name?.trim() || null,
    father_phone: values.father_phone?.trim() || null,
    father_company: values.father_company?.trim() || null,
    mother_name: values.mother_name?.trim() || null,
    mother_phone: values.mother_phone?.trim() || null,
    mother_company: values.mother_company?.trim() || null,
  })

  /** 提交：新增 → POST；编辑 → PATCH（user_id 不可变，更新时不带） */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const body = buildBody(values)
      if (editing) {
        await updateProfileDetail(editing.id, body)
        message.success(t('memberDetail.profileUpdateSuccess'))
      } else {
        await createProfileDetail({ user_id: uid, ...body })
        message.success(t('memberDetail.profileCreateSuccess'))
      }
      setModalOpen(false)
      // 保存后强制刷新，展示最新档案
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  /** 删除档案：成功后强制刷新（无档案则回到「新增」入口） */
  const doDelete = async () => {
    if (!profile) return
    setDeleting(true)
    try {
      await deleteProfileDetail(profile.id)
      message.success(t('memberDetail.profileDeleteSuccess'))
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      reportError(err)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => void loadProfile()}
      />
    )
  }

  return (
    <>
      {/* 非只读来源提供入口：有档案 → 编辑 + 删除；无档案 → 新增 */}
      {!readOnly && (
        <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
          {profile ? (
            <>
              <Tooltip title={t('memberDetail.profileEditHint')}>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(profile)}
                >
                  {t('memberDetail.edit')}
                </Button>
              </Tooltip>
              <Popconfirm
                title={t('memberDetail.profileDeleteConfirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true, loading: deleting }}
                onConfirm={() => void doDelete()}
              >
                <Tooltip title={t('memberDetail.profileDeleteHint')}>
                  <Button danger icon={<DeleteOutlined />} loading={deleting}>
                    {t('memberDetail.delete')}
                  </Button>
                </Tooltip>
              </Popconfirm>
            </>
          ) : (
            <Tooltip title={t('memberDetail.profileCreateHint')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                {t('memberDetail.create')}
              </Button>
            </Tooltip>
          )}
        </div>
      )}

      {profile ? (
        <Descriptions
          bordered
          size="small"
          column={2}
          items={[
            { key: 'id_card', label: t('memberDetail.fieldIdCard'), children: profile.id_card },
            { key: 'ethnic', label: t('memberDetail.fieldEthnic'), children: profile.ethnic },
            {
              key: 'birth_date',
              label: t('memberDetail.fieldBirthDate'),
              children: profile.birth_date,
            },
            {
              key: 'class_id',
              label: t('memberDetail.fieldClassId'),
              children: profile.class_id,
            },
            {
              key: 'native_place',
              label: t('memberDetail.fieldNativePlace'),
              children: profile.native_place ?? t('profile.noData'),
            },
            {
              key: 'household_location',
              label: t('memberDetail.fieldHouseholdLocation'),
              children: profile.household_location ?? t('profile.noData'),
            },
            {
              key: 'household_type',
              label: t('memberDetail.fieldHouseholdType'),
              children: profile.household_type ?? t('profile.noData'),
            },
            {
              key: 'phone',
              label: t('profile.phone'),
              children: profile.phone ?? t('profile.noData'),
            },
            {
              key: 'email',
              label: t('profile.email'),
              children: profile.email ?? t('profile.noData'),
            },
            {
              key: 'father_name',
              label: t('memberDetail.fieldFatherName'),
              children: profile.father_name ?? t('profile.noData'),
            },
            {
              key: 'father_phone',
              label: t('memberDetail.fieldFatherPhone'),
              children: profile.father_phone ?? t('profile.noData'),
            },
            {
              key: 'father_company',
              label: t('memberDetail.fieldFatherCompany'),
              children: profile.father_company ?? t('profile.noData'),
            },
            {
              key: 'mother_name',
              label: t('memberDetail.fieldMotherName'),
              children: profile.mother_name ?? t('profile.noData'),
            },
            {
              key: 'mother_phone',
              label: t('memberDetail.fieldMotherPhone'),
              children: profile.mother_phone ?? t('profile.noData'),
            },
            {
              key: 'mother_company',
              label: t('memberDetail.fieldMotherCompany'),
              children: profile.mother_company ?? t('profile.noData'),
            },
            {
              key: 'created_at',
              label: t('memberDetail.fieldProfileCreatedAt'),
              children: profile.created_at
                ? formatDateTime(profile.created_at, locale)
                : t('profile.noData'),
            },
            {
              key: 'updated_at',
              label: t('memberDetail.fieldProfileUpdatedAt'),
              children: profile.updated_at
                ? formatDateTime(profile.updated_at, locale)
                : t('profile.noData'),
            },
          ]}
        />
      ) : (
        <Alert type="info" showIcon title={t('memberDetail.profileEmpty')} />
      )}

      {/* 新增 / 编辑共用弹窗：字段覆盖 /api/profile-details 允许修改的全部字段 */}
      <Modal
        open={modalOpen}
        title={
          editing ? t('memberDetail.profileEditTitle') : t('memberDetail.profileCreateTitle')
        }
        okText={t('memberDetail.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {/* user_id 固定为当前成员，隐藏保存 */}
          <Form.Item name="user_id" hidden>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16 }}>
            <Form.Item
              name="id_card"
              label={t('memberDetail.fieldIdCard')}
              rules={[{ required: true, message: t('memberDetail.fieldRequired') }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="ethnic"
              label={t('memberDetail.fieldEthnic')}
              rules={[{ required: true, message: t('memberDetail.fieldRequired') }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="birth_date"
              label={t('memberDetail.fieldBirthDate')}
              rules={[{ required: true, message: t('memberDetail.fieldRequired') }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="class_id"
              label={t('memberDetail.fieldClassId')}
              rules={[{ required: true, message: t('memberDetail.fieldRequired') }]}
            >
              <InputNumber style={{ width: '100%' }} precision={0} min={0} />
            </Form.Item>
            <Form.Item name="native_place" label={t('memberDetail.fieldNativePlace')}>
              <Input />
            </Form.Item>
            <Form.Item name="household_location" label={t('memberDetail.fieldHouseholdLocation')}>
              <Input />
            </Form.Item>
            <Form.Item name="household_type" label={t('memberDetail.fieldHouseholdType')}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label={t('profile.phone')}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label={t('profile.email')}>
              <Input />
            </Form.Item>
            <Form.Item name="father_name" label={t('memberDetail.fieldFatherName')}>
              <Input />
            </Form.Item>
            <Form.Item name="father_phone" label={t('memberDetail.fieldFatherPhone')}>
              <Input />
            </Form.Item>
            <Form.Item name="father_company" label={t('memberDetail.fieldFatherCompany')}>
              <Input />
            </Form.Item>
            <Form.Item name="mother_name" label={t('memberDetail.fieldMotherName')}>
              <Input />
            </Form.Item>
            <Form.Item name="mother_phone" label={t('memberDetail.fieldMotherPhone')}>
              <Input />
            </Form.Item>
            <Form.Item name="mother_company" label={t('memberDetail.fieldMotherCompany')}>
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  )
}

/**
 * 成绩信息 Tab：展示成员全部成绩，点击行编辑（PATCH /api/examinations/{id}）。
 * readOnly=true（如老师端班级管理进入）时隐藏编辑入口与行点击编辑，仅作查询（代码要求 14）。
 */
function GradesTab({ uid, t, readOnly }: { uid: number; t: TranslateFn; readOnly: boolean }) {
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()

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
        setError(extractErrorReason(err, t))
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
          reportError(err)
        }
        setEditTarget(null)
      } finally {
        setEditLoading(false)
      }
    },
    [form, reportError],
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
      // 保存后强制刷新，展示最新成绩（代码要求 13）
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ColumnsType<CourseScoreInfo>>(() => {
    const cols: ColumnsType<CourseScoreInfo> = [
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
      ]
    // 只读来源（老师端班级管理）不展示成绩编辑入口
    if (!readOnly) {
      cols.push({
        title: t('approval.colAction'),
        key: 'action',
        width: 100,
        render: (_: unknown, record: CourseScoreInfo) => (
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
      })
    }
    return cols
  }, [t, courseDetails, openEdit, readOnly])

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
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
        <ErrorState
          message={error}
          onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
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
          /* 只读来源不响应行点击编辑（老师端仅查询） */
          onRow={
            readOnly
              ? undefined
              : (record) => ({
                  onClick: (e: React.MouseEvent) => {
                    const target = e.target as HTMLElement
                    if (target.closest('button')) return
                    void openEdit(record)
                  },
                  title: t('memberDetail.scoreEditHint'),
                  style: { cursor: 'pointer' },
                })
          }
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

/**
 * 「获得加分总数」Tab（党委支部端 / 学院端 / 学校端成员详情专用）：
 * 顶部展示「基础分 70 + 党建活动加分 = 获得加分总数」；
 * 下方分页列出该成员的全部加分申请（GET /api/party-scores?user_id=成员），
 * 点击行通过 GET /api/party-scores/{id} 查看详情（含附件下载地址，代码要求 14）。
 */
function PartyScoreTab({
  uid,
  t,
  locale,
}: {
  uid: number
  t: TranslateFn
  locale: 'zh' | 'en'
}) {
  const reportError = useErrorFeedback()

  const [records, setRecords] = useState<PartyScore[]>([])
  const [total, setTotal] = useState(0)
  const [bonusText, setBonusText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState({ seq: 0, force: false })

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<PartyScoreDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 该成员的全部加分申请（分页最多 100 行，代码要求 12）
      const res = await queryPartyScores(
        { user_id: uid, page, page_size: MEMBER_DETAIL_PAGE_SIZE },
        reload.force,
      )
      // 列表摘要可能缺 template_id / created_at / updated_at，详情接口才返回完整字段；
      // 这里补齐后再交给表格展示，确保创建时间与更新时间可见。
      setRecords(await hydratePartyScoreRows(res.data, reload.force))
      setTotal(res.total)
      try {
        // 加分总计接口失败时退回「本页已核定分数之和」，保证总数区域仍可展示
        const totals = await getPartyScoreTotals([uid], reload.force)
        const hit = totals.find(([id]) => id === uid)
        setBonusText(hit ? hit[1] : '0')
      } catch (err) {
        const sum = res.data.reduce((acc, record) => {
          const value = Number(record.approved_score)
          return Number.isFinite(value) ? acc + value : acc
        }, 0)
        setBonusText(String(sum))
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          reportError(err)
        }
      }
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, page, reload.seq, reload.force])

  useEffect(() => {
    void load()
  }, [load])

  /** 获得加分总数 = 基础分 70 + 党建活动加分合计 */
  const totalText = useMemo(() => {
    if (bonusText === null) return '—'
    const bonus = Number(bonusText)
    return Number.isFinite(bonus) ? String(PARTY_SCORE_BASE + bonus) : '—'
  }, [bonusText])

  const openDetail = useCallback(
    async (record: PartyScore) => {
      setDetailOpen(true)
      setDetail(null)
      setDetailLoading(true)
      try {
        setDetail(await getPartyScore(record.id, true))
      } catch (err) {
        reportError(err)
        setDetailOpen(false)
      } finally {
        setDetailLoading(false)
      }
    },
    [reportError],
  )

  const columns = useMemo<ColumnsType<PartyScore>>(
    () => [
      {
        title: t('memberDetail.partyScoreColId'),
        dataIndex: 'id',
        key: 'id',
        width: 100,
      },
      {
        title: t('memberDetail.partyScoreColRequested'),
        dataIndex: 'requested_score',
        key: 'requested_score',
        width: 110,
        align: 'center',
        render: (v: string) => (
          <span style={{ fontWeight: 600, color: isNegativePartyScore(v) ? '#cf1322' : '#389e0d' }}>
            {formatPartyScore(v)}
          </span>
        ),
      },
      {
        title: t('memberDetail.partyScoreColApproved'),
        dataIndex: 'approved_score',
        key: 'approved_score',
        width: 110,
        align: 'center',
        render: (v: string | null) => (
          <span style={{ fontWeight: 600, color: isNegativePartyScore(v) ? '#cf1322' : '#389e0d' }}>
            {formatPartyScore(v)}
          </span>
        ),
      },
      {
        title: t('memberDetail.partyScoreColInstance'),
        dataIndex: 'approval_instance_id',
        key: 'approval_instance_id',
        width: 110,
      },
      {
        title: t('memberDetail.partyScoreColCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 170,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('memberDetail.partyScoreColUpdatedAt'),
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 170,
        render: (v: string) => formatDateTime(v, locale),
      },
    ],
    [t, locale],
  )

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.partyScoreRefreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      <Descriptions
        bordered
        size="small"
        column={3}
        style={{ marginBottom: 12 }}
        items={[
          {
            key: 'base',
            label: t('memberDetail.partyScoreBaseScore'),
            children: PARTY_SCORE_BASE,
          },
          {
            key: 'bonus',
            label: t('memberDetail.partyScoreBonusScore'),
            children: bonusText === null ? '—' : formatPartyScore(bonusText),
          },
          {
            key: 'total',
            label: t('memberDetail.partyScoreTotalLabel'),
            children: <Text strong>{totalText}</Text>,
          },
        ]}
      />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
        />
      ) : (
        <Table<PartyScore>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={records}
          locale={{ emptyText: t('memberDetail.partyScoreEmpty') }}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: () => void openDetail(record),
            title: t('memberDetail.partyScoreRowClickHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: MEMBER_DETAIL_PAGE_SIZE,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      <Modal
        open={detailOpen}
        title={t('memberDetail.partyScoreDetailTitle')}
        footer={null}
        onCancel={() => setDetailOpen(false)}
        destroyOnHidden
      >
        <Spin spinning={detailLoading}>
          {detail && (
            <>
              <Descriptions
                bordered
                size="small"
                column={1}
                items={[
                  {
                    key: 'id',
                    label: t('memberDetail.partyScoreColId'),
                    children: detail.id,
                  },
                  {
                    key: 'template',
                    label: t('memberDetail.partyScoreTemplate'),
                    children: detail.template_id,
                  },
                  {
                    key: 'requested',
                    label: t('memberDetail.partyScoreColRequested'),
                    children: formatPartyScore(detail.requested_score),
                  },
                  {
                    key: 'approved',
                    label: t('memberDetail.partyScoreColApproved'),
                    children: formatPartyScore(detail.approved_score),
                  },
                  {
                    key: 'reason',
                    label: t('memberDetail.partyScoreReason'),
                    children: detail.reason?.trim() ? detail.reason : '—',
                  },
                  {
                    key: 'instance',
                    label: t('memberDetail.partyScoreColInstance'),
                    children: detail.approval_instance_id,
                  },
                  {
                    key: 'created',
                    label: t('memberDetail.partyScoreColCreatedAt'),
                    children: formatDateTime(detail.created_at, locale),
                  },
                  {
                    key: 'updated',
                    label: t('memberDetail.partyScoreColUpdatedAt'),
                    children: formatDateTime(detail.updated_at, locale),
                  },
                  {
                    key: 'files',
                    label: t('memberDetail.partyScoreFiles'),
                    children: (detail.file_urls ?? []).length ? (
                      <Space direction="vertical" size={4}>
                        {(detail.file_urls ?? []).map((url, idx) => (
                          <a key={`${url}-${idx}`} href={url} target="_blank" rel="noreferrer">
                            {t('memberDetail.partyScoreFileItem', { n: idx + 1 })}
                          </a>
                        ))}
                      </Space>
                    ) : (
                      t('memberDetail.partyScoreNoFiles')
                    ),
                  },
                ]}
              />
              <section className="party-approval-section" style={{ marginTop: 16 }}>
                <h4 className="party-approval-section-title">
                  {t('memberDetail.partyScoreApprovalFlow')}
                </h4>
                <PartyScoreApprovalRecords instanceId={detail.approval_instance_id} force />
              </section>
            </>
          )}
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
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
  }, [uid, t])

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
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.refreshHint')}>
          <Button icon={<ReloadOutlined />} onClick={() => setReloadSeq((s) => s + 1)}>
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReloadSeq((s) => s + 1)}
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

/**
 * 奖学金及补助 Tab：分页展示该成员的奖学金/补助记录，点击行查看详情。
 * 非只读来源（管理端 / 党委学校端）支持新增、编辑（金额以元输入、提交转分）与删除；
 * readOnly=true（如老师端班级管理进入）时隐藏以上入口，仅作查询。
 */
function RewardingTab({
  uid,
  t,
  locale,
  readOnly,
}: {
  uid: number
  t: TranslateFn
  locale: 'zh' | 'en'
  readOnly: boolean
}) {
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const [rows, setRows] = useState<RewardingDto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState({ seq: 0, force: false })
  const [detail, setDetail] = useState<RewardingDto | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RewardingDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form] = Form.useForm<RewardingFormValues>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await queryRewardings(
        { page, page_size: MEMBER_DETAIL_PAGE_SIZE, uid },
        reload.force,
      )
      setRows(res.data)
      setTotal(res.total)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
  }, [uid, page, reload.seq, reload.force, t])

  useEffect(() => {
    void load()
  }, [load])

  /** 打开「新增」弹窗：uid 固定为当前成员 */
  const openCreate = useCallback(() => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }, [form])

  /** 打开「编辑」弹窗：回填项目名称与金额（分 → 元） */
  const openEdit = useCallback(
    (record: RewardingDto) => {
      setEditing(record)
      form.setFieldsValue({
        project: record.project,
        amount_yuan: record.amount_cents / 100,
      })
      setModalOpen(true)
    },
    [form],
  )

  /** 提交：新增 → POST；编辑 → PATCH（金额「元」转换为后端「分」） */
  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        uid,
        project: values.project.trim(),
        amount_cents: yuanToCents(values.amount_yuan),
      }
      if (editing) {
        await updateRewarding(editing.id, payload)
        message.success(t('rewarding.updateSuccess'))
      } else {
        await createRewarding(payload)
        message.success(t('rewarding.createSuccess'))
      }
      setModalOpen(false)
      // 保存后强制刷新，展示最新记录
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  /** 删除记录：成功后强制刷新 */
  const doDelete = useCallback(
    async (id: number) => {
      setDeletingId(id)
      try {
        await deleteRewarding(id)
        message.success(t('rewarding.deleteSuccess'))
        setReload((r) => ({ seq: r.seq + 1, force: true }))
      } catch (err) {
        reportError(err)
      } finally {
        setDeletingId(null)
      }
    },
    [reportError, message, t],
  )

  const columns = useMemo<ColumnsType<RewardingDto>>(() => {
    const cols: ColumnsType<RewardingDto> = [
      {
        title: t('rewarding.colProject'),
        dataIndex: 'project',
        key: 'project',
        ellipsis: true,
        render: (v: string) => <span title={v}>{v || '—'}</span>,
      },
      {
        title: t('rewarding.colAmount'),
        dataIndex: 'amount_cents',
        key: 'amount_cents',
        width: 160,
        align: 'right',
        render: (cents: number) => formatCentsAsYuan(cents, locale),
      },
      {
        title: t('rewarding.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 190,
        render: (v: string) => formatDateTime(v, locale),
      },
    ]
    // 只读来源（老师端班级管理）不展示编辑/删除入口
    if (!readOnly) {
      cols.push({
        title: t('approval.colAction'),
        key: 'action',
        width: 170,
        render: (_: unknown, record: RewardingDto) => (
          <div className="approval-actions">
            <Tooltip title={t('memberDetail.rewardingEditHint')}>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(record)}
              >
                {t('rewarding.edit')}
              </Button>
            </Tooltip>
            <Popconfirm
              title={t('rewarding.deleteConfirm')}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true, loading: deletingId === record.id }}
              onConfirm={() => void doDelete(record.id)}
            >
              <Tooltip title={t('memberDetail.rewardingDeleteHint')}>
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingId === record.id}
                >
                  {t('rewarding.delete')}
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
        ),
      })
    }
    return cols
  }, [t, locale, openEdit, readOnly, deletingId, doDelete])

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.rewardingRefreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
        {/* 非只读来源提供新增入口 */}
        {!readOnly && (
          <Tooltip title={t('memberDetail.rewardingCreateHint')}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('rewarding.createTitle')}
            </Button>
          </Tooltip>
        )}
      </div>

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
        />
      ) : (
        <Table<RewardingDto>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 890 }}
          onRow={(record) => ({
            onClick: (e: React.MouseEvent) => {
              const target = e.target as HTMLElement
              // 点击操作按钮或气泡确认框时不触发行详情
              if (target.closest('button') || target.closest('.ant-popover')) return
              setDetail(record)
            },
            title: t('memberDetail.rewardingRowClickHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: MEMBER_DETAIL_PAGE_SIZE,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      <Modal
        open={detail !== null}
        title={t('rewarding.detailTitle')}
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
              { key: 'id', label: t('common.id'), children: detail.id },
              { key: 'uid', label: t('rewarding.colUid'), children: detail.uid },
              {
                key: 'project',
                label: t('rewarding.colProject'),
                children: detail.project || '—',
              },
              {
                key: 'amount',
                label: t('rewarding.colAmount'),
                children: formatCentsAsYuan(detail.amount_cents, locale),
              },
              {
                key: 'created_at',
                label: t('rewarding.colCreatedAt'),
                children: formatDateTime(detail.created_at, locale),
              },
            ]}
          />
        )}
      </Modal>

      {/* 新增 / 编辑共用弹窗：uid 固定为当前成员，金额以元输入 */}
      <Modal
        open={modalOpen}
        title={editing ? t('rewarding.editTitle') : t('rewarding.createTitle')}
        okText={t('memberDetail.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="project"
            label={t('rewarding.fieldProject')}
            rules={[{ required: true, message: t('rewarding.projectRequired') }]}
          >
            <Input maxLength={REWARDING_PROJECT_MAX_LENGTH} showCount />
          </Form.Item>
          <Form.Item
            name="amount_yuan"
            label={t('rewarding.fieldAmount')}
            rules={[{ required: true, message: t('rewarding.amountRequired') }]}
            extra={t('rewarding.amountHint')}
          >
            <InputNumber
              style={{ width: '100%' }}
              prefix="¥"
              step={REWARDING_AMOUNT_STEP_YUAN}
              precision={2}
              min={REWARDING_AMOUNT_MIN_YUAN}
              max={REWARDING_AMOUNT_MAX_YUAN}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/**
 * 违规信息 Tab：分页展示成员违规记录，点击行查看详细，支持编辑（PATCH /api/violations/{id}）。
 * readOnly=true（如老师端班级管理进入）时隐藏编辑入口，仅可查看详情（代码要求 14）。
 */
function ViolationTab({ uid, t, readOnly }: { uid: number; t: TranslateFn; readOnly: boolean }) {
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
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
        setError(extractErrorReason(err, t))
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
        reportError(err)
      }
    } finally {
      setDetailLoading(false)
    }
  }, [reportError])

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
      // 保存后强制刷新，展示最新数据（代码要求 13）
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ColumnsType<ViolationDto>>(() => {
    const cols: ColumnsType<ViolationDto> = [
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
      ]
    // 只读来源（老师端班级管理）不展示违规编辑入口
    if (!readOnly) {
      cols.push({
        title: t('approval.colAction'),
        key: 'action',
        width: 100,
        render: (_: unknown, record: ViolationDto) => (
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
      })
    }
    return cols
  }, [t, locale, openEdit, readOnly])

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
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
        <ErrorState
          message={error}
          onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
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

      {/* 违规详情：点击行查看（代码要求 14） */}
      <Modal
        open={detail !== null}
        title={t('memberDetail.violationDetailTitle')}
        onCancel={() => setDetail(null)}
        footer={[
          // 只读来源（老师端班级管理）仅提供关闭按钮
          ...(readOnly
            ? []
            : [
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
              ]),
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
