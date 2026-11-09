/** 管理员端 - 用户管理：搜索、分页、增删改与详情查看。 */

import { useAccountSwitch } from '../../composables/useAccountSwitch'
import { isEntryActionTarget } from '../../utils/entryInteraction'
import { isVisibleUserRole } from '../../config/rbac'
import { useRequestSequence } from '../../composables/useRequestSequence'
import { useSharedResource } from '../../composables/useSharedResource'
import { myRolesResource } from '../../store/referenceData'
import {
  MoreOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
  TreeSelect,
  Tooltip,
  type FormListFieldData,
  type FormListOperation,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  createUsers,
  deleteUser,
  queryUsers,
  resetUserPassword,
} from '../../api/users'
import type { UserInsertMode } from '../../api/users'
import type {
  Gender,
  UserCreateRequest,
  UserInfo,
  UserStatus,
} from '../../api/types/users'
import { queryUserRoles } from '../../api/rbac'
import type { RoleInfo } from '../../api/types/rbac'
import { listAllOrganizations } from '../../api/organizations'
import type { OrganizationInfo } from '../../api/types/organizations'
import UsablePositionSelect from '../../components/UsablePositionSelect'
import { getCurrentUser } from '../../api/auth'
import { useAuthStore } from '../../store/auth'
import { useUiStateStore } from '../../store/uiState'
import { extractErrorReason } from '../../api/common'
import ErrorState from '../../components/ErrorState'
import RecentAccountSwitcher from '../../components/RecentAccountSwitcher'
import PersonSearchBox from '../../components/PersonSearchBox'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { usePositionLabel } from '../../composables/usePositionLabel'
import { useUserOrganizations } from '../../composables/useUserOrganizations'
import { useT } from '../../i18n'
import { formatPaginationTotal } from '../../utils/pagination'
import { isUidTerm } from '../../utils/personSearch'
import { normalizeGender } from '../../utils/gender'
import { DEFAULT_TABLE_PAGE_SIZE } from '../../config/table'

interface CreateFormValues {
  /** 用户 ID（学号/工号），后端不再自动生成 */
  uid: number
  username: string
  password?: string
  name?: string
  gender?: Gender
  posts: { org_id: number; position: string; workplace?: string }[]
}

/** 批量新增：CSV 解析后的单行（对应 /api/users 的 UserCreateRequest 各字段） */
interface ParsedUser {
  /** 用户 ID（学号/工号），字符串便于校验，提交时转为数字 */
  uid: string
  username: string
  password: string
  name: string
  gender: string
  org: string
  pos: string
  workplaces: string
  /** 解析/校验错误，非空表示该行不可提交 */
  error?: string
}

/** 草稿留在搜索组件内，避免每次按键重渲染整张用户表格。 */
function UserListSearch({ onSearch, initialValue }: { onSearch: (value: string) => void; initialValue: string }) {
  const t = useT()
  const [value, setValue] = useState(initialValue)

  return (
    <PersonSearchBox
      className="admin-search"
      value={value}
      onChange={(next) => {
        setValue(next)
        if (next === '') onSearch('')
      }}
      onSearch={onSearch}
      placeholder={t('adminUsers.searchPlaceholder')}
    />
  )
}

/**
 * 管理端：用户与账户（列表/新建/详细（详情页内编辑）/重置密码/删除）
 * @returns 类型：Element
 */
export default function UsersAdminView() {
  const t = useT()
  const { message, modal } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()

  const listKey = `${portalKey}:admin_m1`
  const [savedList] = useState(() => useUiStateStore.getState().userLists[listKey])
  const [viewToken] = useState(() => useAuthStore.getState().token)

  const [rows, setRows] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(savedList?.page ?? 1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState(savedList?.keyword ?? '')
  // 学号精确筛选（对应后端 ids 查询参数）
  const [uidFilter, setUidFilter] = useState(savedList?.uidFilter ?? '')
  const [status, setStatus] = useState<UserStatus | 'all'>(savedList?.status ?? 'all')
  useEffect(() => {
    if (useAuthStore.getState().token !== viewToken) return
    useUiStateStore.getState().setUserListState(listKey, { page, keyword, uidFilter, status })
  }, [listKey, page, keyword, uidFilter, status, viewToken])

  // 列表重载令牌：seq 变化触发重新加载，force=true 时绕过会话缓存（手动刷新）
  const [reload, setReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  const [rolesError, setRolesError] = useState<string | null>(null)
  const requests = useRequestSequence()
  const [roleMap, setRoleMap] = useState<Map<number, RoleInfo[]>>(new Map())
  // 组织 / 职位选项：仅用于新建用户弹窗（编辑入口已移到成员详情页，见 MemberDetailPage）
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([])
  // 组织 ID → 组织信息：用户任职列直接用这份全量组织数据展示名称与编码，
  // 不再按 org_id 逐个请求 GET /organizations/{id}（组织量多时会产生大量零散请求）。
  const organizationById = useMemo(
    () => new Map(organizations.map((org) => [org.id, org])),
    [organizations],
  )
  const [myUid, setMyUid] = useState<number | null>(null)
  const { data: myRoles } = useSharedResource(myRolesResource)
  const isSuperAdmin = myRoles.some((role) => role.code === 'super_admin')
  const { switchAccount, switchingUid } = useAccountSwitch()

  // 当前页用户的组织任职（走会话缓存，与组织架构页共用）
  const pageUids = useMemo(() => rows.map((u) => u.uid), [rows])
  const userOrgs = useUserOrganizations(pageUids)
  // 职位编码 → 职位名称（任职接口只返回编码，展示时映射为名称，管理员附带编号）
  const positionLabel = usePositionLabel()

  // 双击行进入成员详情页（与组织架构共用同一页面，?from=admin_m1 让侧栏保持高亮本模块）
  const openDetail = useCallback(
    (uid: number) => {
      navigate(`/portal/${portalKey}/organization-members/${uid}?from=admin_m1`)
    },
    [navigate, portalKey],
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm<CreateFormValues>()

  const [resetResult, setResetResult] = useState<string | null>(null)
  // 重置密码弹窗：可指定新密码（留空则由后端生成随机密码）
  const [resetUid, setResetUid] = useState<number | null>(null)
  const [resetRunning, setResetRunning] = useState(false)
  const [resetPwdForm] = Form.useForm<{ password?: string }>()
  const [actingUid, setActingUid] = useState<number | null>(null)

  // 批量新增用户（基于 POST /api/users，CSV 解析为数组后一次性提交）
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchMode, setBatchMode] = useState<UserInsertMode>('insert')
  const [batchText, setBatchText] = useState('')
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchPreview, setBatchPreview] = useState<ParsedUser[] | null>(null)

  const reportError = useErrorFeedback()

  // 当前用户与组织独立加载，组织分页不能延迟本人操作保护。
  useEffect(() => {
    let cancelled = false
    void getCurrentUser().then((me) => {
      if (!cancelled) setMyUid(me.uid)
    }).catch(() => {})
    void listAllOrganizations().then((orgList) => {
      if (!cancelled) setOrganizations(orgList)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    setRolesError(null)
    setRoleMap(new Map())
    try {
      const res = await queryUsers(
        {
          page,
          page_size: DEFAULT_TABLE_PAGE_SIZE,
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
          ...(uidFilter ? { ids: uidFilter } : {}),
          ...(status === 'all' ? {} : { status }),
        },
        reload.force,
      )
      if (!isCurrent()) return
      setRows(res.data)
      setTotal(res.total)
      // 列表已可用；角色在后台补齐，不延长整张表的加载状态。
      setLoading(false)

      // 按当前页查询；查询他人需 admin，不能通过调整本人位置绕过权限检查。
      const uids = res.data.map((u) => u.uid)
      if (uids.length) {
        try {
          const userRoles = await queryUserRoles(uids, reload.force)
          if (!isCurrent()) return
          const map = new Map<number, RoleInfo[]>(uids.map((uid) => [uid, []]))
          for (const role of userRoles) {
            const arr = map.get(role.uid)
            if (arr) arr.push(role)
            else map.set(role.uid, [role])
          }
          setRoleMap(map)
        } catch (err) {
          if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
            const reason = extractErrorReason(err, t)
            setRolesError(axios.isAxiosError(err) && err.response?.status === 403
              ? `${reason} ${t('adminUsers.rolesPermissionHint')}` : reason)
          }
        }
      }
    } catch (err) {
      if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [page, keyword, uidFilter, status, reload.force, t, requests])

  useEffect(() => {
    void load()
    return () => requests.invalidate()
  }, [load, reload.seq, requests])

  /**
   * 人员搜索：提交后按输入内容筛选列表。
   * - 纯数字 → 视为学号，用 ids 精确筛选（当前列表字段为 keyword/ids 二选一，此处清空 keyword）；
   * - 其他 → 视为姓名，用 keyword 模糊筛选（清空 ids）；
   * - 空串 → 同时清空两者，恢复完整列表。
   * 判定为学号的规则与组织架构页共用（见 utils/personSearch）。
   * @param raw 搜索框输入值（必填，可含首尾空白）
   */
  const onSearchPerson = (raw: string) => {
    const term = raw.trim()
    if (!term) {
      setKeyword('')
      setUidFilter('')
    } else if (isUidTerm(term)) {
      setUidFilter(term)
      setKeyword('')
    } else {
      setKeyword(term)
      setUidFilter('')
    }
    setPage(1)
  }

  const orgOptions = useMemo(
    () => organizations.map((o) => ({ value: o.id, title: `${o.name}（${o.code}）` })),
    [organizations],
  )

  const openCreate = () => {
    // 后端创建用户时必须至少写入一条组织任职（空 org/pos/workplaces 会触发其 SQL 构造缺陷）
    createForm.setFieldsValue({ posts: [{}] })
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    const values = await createForm.validateFields()
    if (!values.posts || values.posts.length === 0) {
      message.warning(t('adminUsers.postRequired'))
      return
    }
    setCreating(true)
    try {
      const count = await createUsers([
        {
          uid: values.uid,
          username: values.username.trim(),
          password: values.password?.trim() || undefined,
          name: values.name?.trim() || undefined,
          gender: values.gender,
          org: values.posts.map((p) => p.org_id),
          pos: values.posts.map((p) => p.position),
          workplaces: values.posts.map((p) => p.workplace?.trim() || ''),
        },
      ])
      setCreateOpen(false)
      createForm.resetFields()
      setPage(1)
      setReload((r) => ({ seq: r.seq + 1, force: false }))
      // 后端响应仅为创建条数；未显式设置的密码由后端生成但不返回明文，
      // 需在列表中使用“重置密码”获取。
      modal.info({
        title: t('adminUsers.createSuccess'),
        content: `${t('adminUsers.createdCount', { count })} ${t('adminUsers.createDoneHint2')}`,
      })
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setCreating(false)
    }
  }

  /** 打开批量新增弹窗，重置表单与预览 */
  const openBatch = () => {
    setBatchMode('insert')
    setBatchPreview(null)
    setBatchText('')
    setBatchOpen(true)
  }

  /**
   * 解析 CSV 文本为 ParsedUser[]。
   * - `#` 开头的行视为注释跳过，空行跳过。
   * - 首个非注释行若包含 "username" 视为表头并跳过，否则按固定列顺序解析。
   * - 列顺序固定为：uid,username,password,name,gender,org,pos,workplaces。
   * - org/pos/workplaces 多值用 `|` 分隔，三者在后端按下标并行组成任职。
   * - uid 必填且为正整数（后端不再自动生成）；username 必填，为空标记 error。
   */
  const parseBatchCSV = (text: string): ParsedUser[] => {
    const out: ParsedUser[] = []
    let headerSkipped = false
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      if (!headerSkipped) {
        headerSkipped = true
        if (line.toLowerCase().includes('username')) continue
      }
      const cells = line.split(',').map((c) => c.trim())
      const uid = cells[0] ?? ''
      const username = cells[1] ?? ''
      const gender = (cells[4] ?? '').toLowerCase()
      const orgStr = cells[5] ?? ''
      const error =
        !uid || !/^[1-9]\d*$/.test(uid)
          ? t('adminUsers.batchErrUid')
          : !username
            ? t('adminUsers.batchErrUsername')
            : gender && !normalizeGender(gender)
              ? t('adminUsers.batchErrGender')
              : orgStr && orgStr.split('|').some((o) => o && isNaN(Number(o)))
                ? t('adminUsers.batchErrOrg')
                : undefined
      out.push({
        uid,
        username,
        password: cells[2] ?? '',
        name: cells[3] ?? '',
        gender: cells[4] ?? '',
        org: orgStr,
        pos: cells[6] ?? '',
        workplaces: cells[7] ?? '',
        error,
      })
    }
    return out
  }

  /** 点击预览：解析 CSV 并展示到表格 */
  const previewBatch = () => {
    const rows = parseBatchCSV(batchText)
    if (rows.length === 0) {
      message.warning(t('adminUsers.batchEmpty'))
      setBatchPreview(null)
      return
    }
    setBatchPreview(rows)
  }

  /** 将 ParsedUser 转为 POST /api/users 的 UserCreateRequest */
  const toCreateRequest = (u: ParsedUser): UserCreateRequest => {
    const split = (s: string) =>
      s ? s.split('|').map((x) => x.trim()).filter(Boolean) : []
    const orgs = split(u.org).map(Number)
    const pos = split(u.pos)
    const workplaces = split(u.workplaces)
    const gender = normalizeGender(u.gender)
    return {
      uid: Number(u.uid),
      username: u.username,
      password: u.password || undefined,
      name: u.name || undefined,
      gender,
      org: orgs.length ? orgs : undefined,
      pos: pos.length ? pos : undefined,
      workplaces: workplaces.length ? workplaces : undefined,
    }
  }

  /**
   * 提交批量创建：CSV 解析为数组后一次性 POST /api/users。
   * 后端事务：任一条失败整批回滚。成功返回创建条数。
   */
  const submitBatch = async () => {
    const rows = parseBatchCSV(batchText)
    if (rows.length === 0) {
      message.warning(t('adminUsers.batchEmpty'))
      return
    }
    const invalid = rows.filter((r) => r.error)
    if (invalid.length > 0) {
      message.warning(t('adminUsers.batchHasError', { count: invalid.length }))
      setBatchPreview(rows)
      return
    }
    setBatchRunning(true)
    try {
      const count = await createUsers(rows.map(toCreateRequest), undefined, batchMode)
      message.success(t(batchMode === 'ignore' ? 'adminUsers.batchIgnoreDone' : 'adminUsers.batchWritten', {
        count, skipped: rows.length - count,
      }))
      setBatchOpen(false)
      setBatchText('')
      setBatchPreview(null)
      setPage(1)
      setReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      reportError(err)
    } finally {
      setBatchRunning(false)
    }
  }

  /** 关闭批量弹窗：若任务已结束，清空敏感数据 */
  const closeBatch = () => {
    if (batchRunning) return
    setBatchOpen(false)
    setBatchText('')
    setBatchPreview(null)
  }

  /** 打开重置密码弹窗（可指定新密码，留空则由后端生成随机密码） */
  const openResetPassword = useCallback(
    (uid: number) => {
      resetPwdForm.resetFields()
      setResetUid(uid)
    },
    [resetPwdForm],
  )

  /** 提交重置密码：填了新密码则重置为指定值，否则由后端生成随机密码 */
  const doResetPassword = async () => {
    if (resetUid === null) return
    const raw = resetPwdForm.getFieldValue('password')
    const newPassword = typeof raw === 'string' ? raw.trim() : ''
    setResetRunning(true)
    try {
      const res = await resetUserPassword(resetUid, newPassword || undefined)
      setResetResult(res.new_password)
      setResetUid(null)
      resetPwdForm.resetFields()
    } catch (err) {
      reportError(err)
    } finally {
      setResetRunning(false)
    }
  }

  const doDelete = async (uid: number) => {
    setActingUid(uid)
    try {
      await deleteUser(uid)
      message.success(t('adminUsers.deleteSuccess'))
      setReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      reportError(err)
    } finally {
      setActingUid(null)
    }
  }

  const columns = useMemo<ColumnsType<UserInfo>>(
    () => [
      {
        title: 'UID',
        dataIndex: 'uid',
        key: 'uid',
        width: 90,
      },
      {
        title: t('adminUsers.fieldName'),
        dataIndex: 'name',
        key: 'name',
        width: 160,
        render: (name: string | null, record) => name || `UID ${record.uid}`,
      },
      {
        title: t('adminUsers.fieldRoles'),
        key: 'roles',
        render: (_, record) => {
          if (rolesError) return <span className="cell-sub">{t('common.loadFailed')}</span>
          if (!roleMap.has(record.uid)) return <span className="cell-sub">{t('common.loading')}</span>
          const list = roleMap.get(record.uid)?.filter(isVisibleUserRole)
          if (!list || list.length === 0) return <span className="cell-sub">—</span>
          return list.map((r) => (
            <Tag key={r.id} color="purple">
              {r.name}
            </Tag>
          ))
        },
      },
      {
        // 用户的组织任职：组织名/身份（职位名称，如「中共党员（ZGDY）」），数据来自 GET /organization-members?uids=
        title: t('adminUsers.colOrgPos'),
        key: 'org_pos',
        width: 260,
        render: (_, record) => {
          if (!userOrgs.has(record.uid)) {
            return <span className="cell-sub">{t('common.loading')}</span>
          }
          const list = userOrgs.get(record.uid) ?? []
          if (list.length === 0) return <span className="cell-sub">—</span>
          return (
            <span className="org-member-tags">
              {list.map((o) => {
                // 组织名称 / 编码优先取全量组织列表，缺失时回退任职记录自带的组织名称；
                // 全程不做单组织查询，避免按行逐个请求 GET /organizations/{id}
                const org = organizationById.get(o.organization_id)
                const orgName = org?.name ?? o.organization_name
                const orgCode = org?.code
                return (
                  <Tag
                    key={`${o.organization_id}-${o.position}`}
                    title={`${orgName}${orgCode ? `（${orgCode}）` : ''} / ${positionLabel(o.position)}${o.workplace ? ' / ' + o.workplace : ''}`}
                  >
                    {orgName}
                    {orgCode ? `（${orgCode}）` : ''}/{positionLabel(o.position)}
                  </Tag>
                )
              })}
            </span>
          )
        },
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: isSuperAdmin ? 230 : 130,
        render: (_, record) => (
          <div className="approval-actions">
            {/* 「详细」进入成员详情页：资料 / 系统角色 / 组织任职的编辑入口都在详情页内（与组织架构一致） */}
            <Button type="link" size="small" onClick={() => openDetail(record.uid)}>
              {t('memberDetail.detail')}
            </Button>
            {isSuperAdmin && myUid !== null && myUid !== record.uid && (
              <Popconfirm
                title={t('adminUsers.switchConfirm', { name: record.name || String(record.uid) })}
                okText={t('adminUsers.switchAccount')}
                cancelText={t('approval.cancel')}
                onConfirm={() => switchAccount(record.uid, record.name)}
                okButtonProps={{ loading: switchingUid === record.uid }}
              >
                <Button type="link" size="small" disabled={switchingUid !== null} loading={switchingUid === record.uid}>
                  {t('adminUsers.switchAccount')}
                </Button>
              </Popconfirm>
            )}
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'reset-password', label: t('adminUsers.resetPassword') },
                  ...(myUid !== null && myUid !== record.uid
                    ? [{ key: 'delete', label: t('adminOrg.delete'), danger: true }]
                    : []),
                ],
                onClick: ({ key }) => {
                  if (key === 'reset-password') {
                    openResetPassword(record.uid)
                    return
                  }
                  if (key !== 'delete') return
                  modal.confirm({
                    title: t('adminUsers.deleteConfirm'),
                    content: `${record.name || record.uid} (${record.uid})`,
                    okText: t('adminOrg.delete'),
                    cancelText: t('approval.cancel'),
                    okButtonProps: { danger: true },
                    onOk: () => doDelete(record.uid),
                  })
                },
              }}
            >
              <Tooltip title={t('adminUsers.moreActions')}>
                <Button type="text" size="small" icon={<MoreOutlined />} loading={actingUid === record.uid} aria-label={t('adminUsers.moreActions')} />
              </Tooltip>
            </Dropdown>
          </div>
        ),
      },
    ],
    [
      t,
      roleMap,
      rolesError,
      userOrgs,
      organizationById,
      positionLabel,
      actingUid,
      modal,
      myUid,
      openResetPassword,
      openDetail,
      isSuperAdmin,
      switchingUid,
      switchAccount,
    ],
  )

  return (
    <div className="data-page-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('adminUsers.title')}</h3>
          <div className="approval-toolbar">
            <UserListSearch onSearch={onSearchPerson} initialValue={uidFilter || keyword} />
            <Select
              value={status}
              style={{ width: 120 }}
              options={[
                { value: 'all', label: t('publish.filterAll') },
                { value: 'enabled', label: t('adminUsers.statusActive') },
                { value: 'disabled', label: t('adminUsers.statusDisabled') },
              ]}
              onChange={(v: UserStatus | 'all') => {
                setPage(1)
                setStatus(v)
              }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
            >
              {t('common.refresh')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('adminUsers.newUser')}
            </Button>
            <Button icon={<TeamOutlined />} onClick={openBatch}>
              {t('adminUsers.batchNew')}
            </Button>
          </div>
        </header>
        {isSuperAdmin && <RecentAccountSwitcher />}
        <div className="panel-card-body">
          {rolesError && !error && (
            <Alert
              type="warning"
              showIcon
              title={t('adminUsers.rolesLoadFailed')}
              description={rolesError}
              style={{ marginBottom: 12 }}
            />
          )}
          {error ? (
            <ErrorState
              message={error}
              onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
            />
          ) : (
            <Table<UserInfo>
              rowKey="uid"
              loading={loading}
              columns={columns}
              dataSource={rows}
              locale={{ emptyText: t('common.noData') }}
              // 双击行任意位置进入成员详情页（按钮区域不触发，避免与详细/重置/删除冲突）
              onRow={(record: UserInfo) => ({
                onDoubleClick: (e: React.MouseEvent) => {
                  if (isEntryActionTarget(e.target)) return
                  if ((e.target as HTMLElement).closest('button')) return
                  openDetail(record.uid)
                },
                title: t('memberDetail.rowClickHint'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize: DEFAULT_TABLE_PAGE_SIZE,
                total,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) => formatPaginationTotal(t, n, DEFAULT_TABLE_PAGE_SIZE),
                onChange: (p: number) => setPage(p),
              }}
            />
          )}
        </div>
      </section>

      <Modal
        open={createOpen}
        title={t('adminUsers.newUser')}
        width={640}
        okText={t('adminUsers.create')}
        cancelText={t('approval.cancel')}
        confirmLoading={creating}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" initialValues={{ posts: [] }}>
          <div className="leave-form-grid">
            <Form.Item
              name="uid"
              label={t('adminUsers.fieldUid')}
              extra={t('adminUsers.uidHint')}
              rules={[
                { required: true, message: t('adminUsers.uidRequired') },
                {
                  validator: (_, value: number | null) =>
                    value === null || value === undefined || (Number.isInteger(value) && value > 0)
                      ? Promise.resolve()
                      : Promise.reject(new Error(t('adminUsers.uidInvalid'))),
                },
              ]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="username"
              label={t('adminUsers.fieldUsername')}
              rules={[{ required: true, message: t('adminUsers.usernameRequired') }]}
            >
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item name="password" label={t('adminUsers.fieldPassword')}>
              <Input.Password maxLength={64} placeholder={t('adminUsers.passwordHint')} />
            </Form.Item>
            <Form.Item name="name" label={t('adminUsers.fieldName')}>
              <Input maxLength={64} />
            </Form.Item>
            <Form.Item name="gender" label={t('adminUsers.fieldGender')}>
              <Select
                allowClear
                options={[
                  { value: 'male', label: t('adminUsers.genderMale') },
                  { value: 'female', label: t('adminUsers.genderFemale') },
                ]}
              />
            </Form.Item>
          </div>

          <div className="user-edit-label">{t('adminUsers.postsTitle')}</div>
          <Alert
            type="warning"
            showIcon
            title={t('adminUsers.postRequired')}
            style={{ marginBottom: 12 }}
          />
          <Form.List name="posts">
            {(
              fields: FormListFieldData[],
              { add, remove }: FormListOperation,
            ) => (
              <div className="user-posts-list">
                {fields.map((field: FormListFieldData) => (
                  <div key={field.key} className="user-post-row">
                    <Form.Item
                      name={[field.name, 'org_id']}
                      rules={[{ required: true, message: t('adminUsers.selectOrg') }]}
                    >
                      <TreeSelect
                        onChange={() => createForm.setFieldValue(['posts', field.name, 'position'], undefined)}
                        treeData={orgOptions}
                        placeholder={t('adminUsers.selectOrg')}
                        allowClear
                        showSearch
                        treeNodeFilterProp="title"
                      />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate>
                      {({ getFieldValue }) => (
                        <Form.Item name={[field.name, 'position']} rules={[{ required: true, message: t('adminOrg.positionPlaceholder') }]}>
                          <UsablePositionSelect organizationId={getFieldValue(['posts', field.name, 'org_id'])} placeholder={t('adminOrg.positionPlaceholder')} allowClear />
                        </Form.Item>
                      )}
                    </Form.Item>
                    <Form.Item name={[field.name, 'workplace']}>
                      <Input placeholder={t('adminOrg.colWorkplace')} />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                  {t('adminUsers.addPost')}
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        open={resetUid !== null}
        title={resetUid !== null ? `${t('adminUsers.resetPassword')} #${resetUid}` : ''}
        width={420}
        okText={t('adminUsers.resetPassword')}
        cancelText={t('approval.cancel')}
        confirmLoading={resetRunning}
        onCancel={() => setResetUid(null)}
        onOk={() => void doResetPassword()}
        destroyOnHidden
      >
        <Form form={resetPwdForm} layout="vertical">
          <Form.Item
            name="password"
            label={t('adminUsers.newPassword')}
            extra={t('adminUsers.passwordHint')}
          >
            <Input.Password maxLength={64} placeholder={t('adminUsers.passwordHint')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={resetResult !== null}
        title={t('adminUsers.resetDoneTitle')}
        footer={null}
        onCancel={() => setResetResult(null)}
      >
        <Alert
          type="warning"
          showIcon
          title={t('adminUsers.resetDoneHint')}
          style={{ marginBottom: 12 }}
        />
        <Input.TextArea
          readOnly
          rows={2}
          value={resetResult ? `${t('adminUsers.newPassword')}: ${resetResult}` : ''}
        />
      </Modal>

      <Modal
        open={batchOpen}
        title={t('adminUsers.batchTitle')}
        width={960}
        okText={t('adminUsers.batchRun')}
        cancelText={t('approval.cancel')}
        confirmLoading={batchRunning}
        okButtonProps={{ disabled: batchRunning }}
        cancelButtonProps={{ disabled: batchRunning }}
        onCancel={closeBatch}
        onOk={() => void submitBatch()}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          title={t('adminUsers.batchHint')}
          description={t('adminUsers.batchHintDesc')}
          style={{ marginBottom: 12 }}
        />
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="batch-user-mode">{t('adminUsers.batchMode')} </label>
          <Select<UserInsertMode>
            id="batch-user-mode"
            value={batchMode}
            disabled={batchRunning}
            style={{ minWidth: 240 }}
            onChange={setBatchMode}
            options={(['insert', 'ignore', 'replace'] as const).map((value) => ({
              value, label: t(`adminUsers.batchMode_${value}`),
            }))}
          />
        </div>
        <Alert
          type={batchMode === 'replace' ? 'warning' : 'info'}
          showIcon
          title={t(`adminUsers.batchModeHint_${batchMode}`)}
          style={{ marginBottom: 12 }}
        />
        <Form layout="vertical">
          <Form.Item
            label={t('adminUsers.batchInput')}
            extra={t('adminUsers.batchInputHint')}
          >
            <Input.TextArea
              value={batchText}
              onChange={(e) => {
                setBatchText(e.target.value)
                setBatchPreview(null)
              }}
              rows={8}
              placeholder={t('adminUsers.batchInputPlaceholder')}
              disabled={batchRunning}
            />
          </Form.Item>
          <Button
            disabled={batchRunning || !batchText.trim()}
            onClick={previewBatch}
            style={{ marginBottom: 12 }}
          >
            {t('adminUsers.batchPreview')}
          </Button>
        </Form>

        {batchPreview && batchPreview.length > 0 && (
          <Table<ParsedUser>
            rowKey={(_, i) => String(i)}
            size="small"
            pagination={false}
            scroll={{ x: 'max-content', y: 260 }}
            dataSource={batchPreview}
            columns={[
              {
                title: '#',
                key: 'idx',
                width: 50,
                render: (_, __, i) => i + 1,
              },
              {
                title: t('adminUsers.fieldUid'),
                dataIndex: 'uid',
                key: 'uid',
                width: 110,
              },
              {
                title: t('adminUsers.fieldUsername'),
                dataIndex: 'username',
                key: 'username',
                width: 120,
              },
              {
                title: t('adminUsers.fieldPassword'),
                dataIndex: 'password',
                key: 'password',
                width: 120,
                render: (v: string) => (
                  <span className="cell-sub">{v || t('adminUsers.batchAutoPwd')}</span>
                ),
              },
              {
                title: t('adminUsers.fieldName'),
                dataIndex: 'name',
                key: 'name',
                width: 100,
                render: (v: string) => v || <span className="cell-sub">—</span>,
              },
              {
                title: t('adminUsers.fieldGender'),
                dataIndex: 'gender',
                key: 'gender',
                width: 80,
                render: (v: string) => {
                  const g = normalizeGender(v)
                  if (!g) return v || <span className="cell-sub">—</span>
                  return g === 'male' ? t('profile.male') : t('profile.female')
                },
              },
              {
                title: 'org',
                dataIndex: 'org',
                key: 'org',
                width: 90,
                render: (v: string) => v || <span className="cell-sub">—</span>,
              },
              {
                title: 'pos',
                dataIndex: 'pos',
                key: 'pos',
                width: 90,
                render: (v: string) => v || <span className="cell-sub">—</span>,
              },
              {
                title: 'workplaces',
                dataIndex: 'workplaces',
                key: 'workplaces',
                width: 110,
                render: (v: string) => v || <span className="cell-sub">—</span>,
              },
              {
                title: t('adminUsers.batchColStatus'),
                key: 'error',
                width: 160,
                fixed: 'right' as const,
                render: (_, r) =>
                  r.error ? (
                    <Tag color="red">{r.error}</Tag>
                  ) : (
                    <Tag color="green">{t('adminUsers.batchResultOk')}</Tag>
                  ),
              },
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
