import {
  KeyOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  AutoComplete,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
  TreeSelect,
  type FormListFieldData,
  type FormListOperation,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createUsers,
  deleteUser,
  queryUsers,
  resetUserPassword,
  type Gender,
  type UserCreateRequest,
  type UserInfo,
  type UserStatus,
} from '../../api/users'
import { queryRoles, queryUserRoles, type RoleInfo } from '../../api/rbac'
import { listAllOrganizations, type OrganizationInfo } from '../../api/organizations'
import { queryPositions, type PositionDetail } from '../../api/positions'
import { getCurrentUser } from '../../api/auth'
import { extractError } from '../../api/common'
import { useUserOrganizations } from '../../composables/useUserOrganizations'
import { useT } from '../../i18n'
import UserEditPanel from './UserEditPanel'

const PAGE_SIZE = 10

interface CreateFormValues {
  username: string
  password?: string
  name?: string
  gender?: Gender
  posts: { org_id: number; position: string; workplace?: string }[]
}

/** 批量新增：CSV 解析后的单行（对应 /api/users 的 UserCreateRequest 各字段） */
interface ParsedUser {
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

/** 管理端：用户与账户（列表/新建/编辑资料与角色与组织任职/重置密码/删除） */
export default function UsersAdminView() {
  const t = useT()
  const { message, modal } = AntdApp.useApp()

  const [rows, setRows] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<UserStatus | 'all'>('all')
  // 列表重载令牌：seq 变化触发重新加载，force=true 时绕过会话缓存（手动刷新）
  const [reload, setReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  const [roleMap, setRoleMap] = useState<Map<number, RoleInfo[]>>(new Map())
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [organizations, setOrganizations] = useState<OrganizationInfo[]>([])
  const [positions, setPositions] = useState<PositionDetail[]>([])
  const [myUid, setMyUid] = useState<number | null>(null)

  // 当前页用户的组织任职（走会话缓存，与组织架构页共用）
  const pageUids = useMemo(() => rows.map((u) => u.uid), [rows])
  const userOrgs = useUserOrganizations(pageUids)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm<CreateFormValues>()

  const [editUid, setEditUid] = useState<number | null>(null)
  const [resetResult, setResetResult] = useState<string | null>(null)
  const [actingUid, setActingUid] = useState<number | null>(null)

  // 批量新增用户（基于 POST /api/users，CSV 解析为数组后一次性提交）
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchPreview, setBatchPreview] = useState<ParsedUser[] | null>(null)

  const showError = useCallback(
    (err: unknown) => {
      const code = extractError(err)
      message.error(
        code === 'network'
          ? t('common.networkError')
          : code === 'failed'
            ? t('common.loadFailed')
            : code,
      )
    },
    [message, t],
  )

  // 基础数据：角色、组织、职位、当前 uid
  useEffect(() => {
    void (async () => {
      try {
        const [me, roleRes, orgList, posRes] = await Promise.all([
          getCurrentUser(),
          queryRoles({ page: 1, page_size: 100 }),
          listAllOrganizations(),
          queryPositions({ page: 1, page_size: 100 }),
        ])
        setMyUid(me.uid)
        setRoles(roleRes.data)
        setOrganizations(orgList)
        setPositions(posRes.data)
      } catch {
        // 各下拉为空时表单仍可手填/提交，错误在列表区体现
      }
    })()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await queryUsers(
        {
          page,
          page_size: PAGE_SIZE,
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
          ...(status === 'all' ? {} : { status }),
        },
        reload.force,
      )
      setRows(res.data)
      setTotal(res.total)

      // 批量查角色：后端在 uids 首位为本人时只返回本人，故把本人排到末尾
      const me = await getCurrentUser().catch(() => null)
      const uids = res.data.map((u) => u.uid)
      if (me) uids.sort((a, b) => (a === me.uid ? 1 : b === me.uid ? -1 : 0))
      if (uids.length) {
        try {
          const userRoles = await queryUserRoles(uids)
          const map = new Map<number, RoleInfo[]>()
          for (const r of userRoles) {
            const arr = map.get(r.uid)
            const { uid, ...role } = r
            if (arr) arr.push(role)
            else map.set(r.uid, [role])
          }
          setRoleMap(map)
        } catch {
          // 角色查询失败不阻塞用户列表
        }
      }
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }, [page, keyword, status, reload.seq, reload.force])

  useEffect(() => {
    void load()
  }, [load])

  const orgOptions = useMemo(
    () => organizations.map((o) => ({ value: o.id, title: `${o.name}（${o.code}）` })),
    [organizations],
  )
  const positionOptions = useMemo(
    () => positions.map((p) => ({ value: p.code, label: `${p.name}（${p.code}）` })),
    [positions],
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
      showError(err)
    } finally {
      setCreating(false)
    }
  }

  /** 打开批量新增弹窗，重置表单与预览 */
  const openBatch = () => {
    setBatchPreview(null)
    setBatchText('')
    setBatchOpen(true)
  }

  /**
   * 解析 CSV 文本为 ParsedUser[]。
   * - `#` 开头的行视为注释跳过，空行跳过。
   * - 首个非注释行若包含 "username" 视为表头并跳过，否则按固定列顺序解析。
   * - 列顺序固定为 BATCH_COLUMNS：username,password,name,gender,org,pos,workplaces。
   * - org/pos/workplaces 多值用 `|` 分隔，三者在后端按下标并行组成任职。
   * - username 必填，为空标记 error。
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
      const username = cells[0] ?? ''
      const gender = (cells[3] ?? '').toLowerCase()
      const orgStr = cells[4] ?? ''
      const error =
        !username
          ? t('adminUsers.batchErrUsername')
          : gender && gender !== 'male' && gender !== 'female'
            ? t('adminUsers.batchErrGender')
            : orgStr && orgStr.split('|').some((o) => o && isNaN(Number(o)))
              ? t('adminUsers.batchErrOrg')
              : undefined
      out.push({
        username,
        password: cells[1] ?? '',
        name: cells[2] ?? '',
        gender: cells[3] ?? '',
        org: orgStr,
        pos: cells[5] ?? '',
        workplaces: cells[6] ?? '',
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
    const gender = (() => {
      const g = u.gender.toLowerCase()
      return g === 'male' || g === 'female' ? (g as Gender) : undefined
    })()
    return {
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
      const count = await createUsers(rows.map(toCreateRequest))
      message.success(t('adminUsers.batchAllDone', { count }))
      setBatchOpen(false)
      setBatchText('')
      setBatchPreview(null)
      setPage(1)
      setReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      showError(err)
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

  const doResetPassword = async (uid: number) => {
    setActingUid(uid)
    try {
      const res = await resetUserPassword(uid)
      setResetResult(res.new_password)
    } catch (err) {
      showError(err)
    } finally {
      setActingUid(null)
    }
  }

  const doDelete = async (uid: number) => {
    setActingUid(uid)
    try {
      await deleteUser(uid)
      message.success(t('adminUsers.deleteSuccess'))
      setReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      showError(err)
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
          const list = roleMap.get(record.uid)
          if (!list || list.length === 0) return <span className="cell-sub">—</span>
          return list.map((r) => (
            <Tag key={r.id} color="purple">
              {r.name}
            </Tag>
          ))
        },
      },
      {
        // 用户的组织任职：组织名 + 职位，数据来自 GET /organizations/users/{uid}
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
              {list.map((o) => (
                <Tag
                  key={`${o.organization_id}-${o.position}`}
                  title={`${o.organization_name} / ${o.position}${o.workplace ? ' / ' + o.workplace : ''}`}
                >
                  {o.organization_name}·{o.position}
                </Tag>
              ))}
            </span>
          )
        },
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 230,
        render: (_, record) => (
          <div className="approval-actions">
            <Button type="link" size="small" onClick={() => setEditUid(record.uid)}>
              {t('adminUsers.edit')}
            </Button>
            <Popconfirm
              title={t('adminUsers.resetConfirm')}
              okText={t('adminUsers.resetPassword')}
              cancelText={t('approval.cancel')}
              okButtonProps={{ loading: actingUid === record.uid }}
              onConfirm={() => void doResetPassword(record.uid)}
            >
              <Button type="link" size="small" icon={<KeyOutlined />}>
                {t('adminUsers.resetPassword')}
              </Button>
            </Popconfirm>
            {myUid !== record.uid && (
              <Popconfirm
                title={t('adminUsers.deleteConfirm')}
                okText={t('adminOrg.delete')}
                cancelText={t('approval.cancel')}
                okButtonProps={{ danger: true, loading: actingUid === record.uid }}
                onConfirm={() => void doDelete(record.uid)}
              >
                <Button type="link" size="small" danger>
                  {t('adminOrg.delete')}
                </Button>
              </Popconfirm>
            )}
          </div>
        ),
      },
    ],
    [t, roleMap, userOrgs, actingUid, myUid],
  )

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('adminUsers.title')}</h3>
          <div className="approval-toolbar">
            <Input.Search
              allowClear
              className="admin-search"
              placeholder={t('adminUsers.searchPlaceholder')}
              onSearch={(v: string) => {
                setPage(1)
                setKeyword(v)
              }}
            />
            <Select
              value={status}
              style={{ width: 120 }}
              options={[
                { value: 'all', label: t('publish.filterAll') },
                { value: 'active', label: t('adminUsers.statusActive') },
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
        <div className="panel-card-body">
          {error ? (
            <Alert
              type="error"
              showIcon
              title={
                error === 'network' ? t('common.networkError') : t('common.loadFailed')
              }
              action={
                <Button
                  size="small"
                  onClick={() =>
                    setReload((r) => ({ seq: r.seq + 1, force: true }))
                  }
                >
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <Table<UserInfo>
              rowKey="uid"
              loading={loading}
              columns={columns}
              dataSource={rows}
              locale={{ emptyText: t('common.noData') }}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) =>
                  `${t('common.total')} ${n} ${t('common.items')}`,
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
                        treeData={orgOptions}
                        placeholder={t('adminUsers.selectOrg')}
                        allowClear
                        showSearch
                        treeNodeFilterProp="title"
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'position']}
                      rules={[{ required: true, message: t('adminOrg.positionPlaceholder') }]}
                    >
                      <AutoComplete
                        options={positionOptions}
                        placeholder={t('adminOrg.positionPlaceholder')}
                        filterOption={(
                          input: string,
                          option?: { label?: unknown },
                        ) =>
                          String(option?.label ?? '')
                            .toLowerCase()
                            .includes(input.toLowerCase())
                        }
                        allowClear
                      />
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
        open={editUid !== null}
        title={editUid !== null ? `${t('adminUsers.edit')} #${editUid}` : ''}
        width={760}
        footer={null}
        onCancel={() => setEditUid(null)}
        destroyOnHidden
      >
        {editUid !== null && (
          <UserEditPanel
            uid={editUid}
            roles={roles}
            organizations={organizations}
            positions={positions}
            onChanged={() =>
              setReload((r) => ({ seq: r.seq + 1, force: false }))
            }
          />
        )}
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
                render: (v: string) => v || <span className="cell-sub">—</span>,
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
