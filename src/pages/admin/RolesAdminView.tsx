import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Table,
  Tabs,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '../../store/settings'
import {
  assignRolePermissions,
  createPermission,
  createRole,
  deletePermission,
  deleteRole,
  getRolePermissions,
  queryPermissions,
  queryRoles,
  updatePermission,
  updateRole,
  type Permission as PermInfo,
  type RoleInfo,
} from '../../api/rbac'
import { extractError } from '../../api/common'
import { formatDateTime } from '../../utils/datetime'
import { useT } from '../../i18n'

const PAGE_SIZE = 10

type RoleFormValues = {
  code: string
  name: string
  description?: string
}
type PermFormValues = {
  code: string
  name: string
  description?: string
}

/**
 * 管理端：角色权限
 * - 角色 CRUD（POST/PATCH/DELETE /rbac/roles）
 * - 权限 CRUD（POST/PATCH/DELETE /rbac/permissions）
 * - 角色-权限覆盖式分配（PUT /rbac/roles/{id}/permissions）
 */
export default function RolesAdminView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()

  // ---- 角色 ----
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [rolePage, setRolePage] = useState(1)
  const [roleTotal, setRoleTotal] = useState(0)
  const [roleKeyword, setRoleKeyword] = useState('')
  // 重载令牌：seq 变化触发重新加载，force=true 时绕过会话缓存（手动刷新）
  const [roleReload, setRoleReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  // ---- 权限 ----
  const [perms, setPerms] = useState<PermInfo[]>([])
  const [permsLoading, setPermsLoading] = useState(true)
  const [permsError, setPermsError] = useState<string | null>(null)
  const [permPage, setPermPage] = useState(1)
  const [permTotal, setPermTotal] = useState(0)
  const [permKeyword, setPermKeyword] = useState('')
  const [permReload, setPermReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })

  // ---- 弹窗 ----
  const [actingId, setActingId] = useState<number | null>(null)
  const [roleModal, setRoleModal] = useState<
    { mode: 'create' | 'edit'; role?: RoleInfo } | null
  >(null)
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleForm] = Form.useForm<RoleFormValues>()

  const [permModal, setPermModal] = useState<
    { mode: 'create' | 'edit'; perm?: PermInfo } | null
  >(null)
  const [permSaving, setPermSaving] = useState(false)
  const [permForm] = Form.useForm<PermFormValues>()

  // 角色-权限分配
  const [assignRole, setAssignRole] = useState<RoleInfo | null>(null)
  const [assignAllPerms, setAssignAllPerms] = useState<PermInfo[]>([])
  const [assignSelected, setAssignSelected] = useState<number[]>([])
  const [assignInitial, setAssignInitial] = useState<number[]>([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignSaving, setAssignSaving] = useState(false)

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

  // ============ 角色加载 ============
  const loadRoles = useCallback(async () => {
    setRolesLoading(true)
    setRolesError(null)
    try {
      const res = await queryRoles(
        {
          page: rolePage,
          page_size: PAGE_SIZE,
          ...(roleKeyword.trim() ? { keyword: roleKeyword.trim() } : {}),
        },
        roleReload.force,
      )
      setRoles(res.data)
      setRoleTotal(res.total)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setRolesError(extractError(err))
      }
    } finally {
      setRolesLoading(false)
    }
  }, [rolePage, roleKeyword, roleReload.seq, roleReload.force])

  useEffect(() => {
    void loadRoles()
  }, [loadRoles])

  // ============ 权限加载 ============
  const loadPerms = useCallback(async () => {
    setPermsLoading(true)
    setPermsError(null)
    try {
      const res = await queryPermissions(
        {
          page: permPage,
          page_size: PAGE_SIZE,
          ...(permKeyword.trim() ? { keyword: permKeyword.trim() } : {}),
        },
        permReload.force,
      )
      setPerms(res.data)
      setPermTotal(res.total)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setPermsError(extractError(err))
      }
    } finally {
      setPermsLoading(false)
    }
  }, [permPage, permKeyword, permReload.seq, permReload.force])

  useEffect(() => {
    void loadPerms()
  }, [loadPerms])

  // ============ 角色 CRUD ============
  const openRoleCreate = () => {
    setRoleModal({ mode: 'create' })
    roleForm.resetFields()
  }

  const openRoleEdit = (role: RoleInfo) => {
    setRoleModal({ mode: 'edit', role })
    roleForm.setFieldsValue({
      code: role.code,
      name: role.name,
      description: role.description,
    })
  }

  const submitRole = async () => {
    const values = await roleForm.validateFields()
    if (!roleModal) return
    setRoleSaving(true)
    try {
      if (roleModal.mode === 'create') {
        await createRole({
          code: values.code.trim(),
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
        })
        message.success(t('adminRoles.createSuccess'))
      } else {
        await updateRole(roleModal.role!.id, {
          code: values.code.trim(),
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
        })
        message.success(t('adminRoles.updateSuccess'))
      }
      setRoleModal(null)
      setRoleReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      showError(err)
    } finally {
      setRoleSaving(false)
    }
  }

  const doDeleteRole = async (role: RoleInfo) => {
    setActingId(role.id)
    try {
      await deleteRole(role.id)
      message.success(t('adminRoles.deleteSuccess'))
      setRoleReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      showError(err)
    } finally {
      setActingId(null)
    }
  }

  // ============ 权限 CRUD ============
  const openPermCreate = () => {
    setPermModal({ mode: 'create' })
    permForm.resetFields()
  }

  const openPermEdit = (perm: PermInfo) => {
    setPermModal({ mode: 'edit', perm })
    permForm.setFieldsValue({
      code: perm.code,
      name: perm.name,
      description: perm.description,
    })
  }

  const submitPerm = async () => {
    const values = await permForm.validateFields()
    if (!permModal) return
    setPermSaving(true)
    try {
      if (permModal.mode === 'create') {
        await createPermission({
          code: values.code.trim(),
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
        })
        message.success(t('adminRoles.permCreateSuccess'))
      } else {
        await updatePermission(permModal.perm!.id, {
          code: values.code.trim(),
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
        })
        message.success(t('adminRoles.permUpdateSuccess'))
      }
      setPermModal(null)
      setPermReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      showError(err)
    } finally {
      setPermSaving(false)
    }
  }

  const doDeletePerm = async (perm: PermInfo) => {
    setActingId(perm.id)
    try {
      await deletePermission(perm.id)
      message.success(t('adminRoles.permDeleteSuccess'))
      setPermReload((r) => ({ seq: r.seq + 1, force: false }))
    } catch (err) {
      showError(err)
    } finally {
      setActingId(null)
    }
  }

  // ============ 角色-权限分配 ============
  const openAssign = async (role: RoleInfo) => {
    setAssignRole(role)
    setAssignLoading(true)
    setAssignSelected([])
    setAssignInitial([])
    try {
      // 拉取全部权限（最多 100 条，足够覆盖典型权限规模）
      const [allRes, current] = await Promise.all([
        queryPermissions({ page: 1, page_size: 100 }),
        getRolePermissions(role.id),
      ])
      setAssignAllPerms(allRes.data)
      const ids = current.map((p) => p.id)
      setAssignSelected(ids)
      setAssignInitial(ids)
    } catch (err) {
      showError(err)
      setAssignRole(null)
    } finally {
      setAssignLoading(false)
    }
  }

  const submitAssign = async () => {
    if (!assignRole) return
    setAssignSaving(true)
    try {
      await assignRolePermissions(assignRole.id, assignSelected)
      setAssignInitial(assignSelected)
      message.success(t('adminRoles.assignSuccess'))
      setAssignRole(null)
    } catch (err) {
      showError(err)
    } finally {
      setAssignSaving(false)
    }
  }

  // ============ 列定义 ============
  const roleColumns = useMemo<ColumnsType<RoleInfo>>(
    () => [
      { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
      {
        title: t('adminRoles.fieldCode'),
        dataIndex: 'code',
        key: 'code',
        width: 160,
        render: (v: string) => <Tag color="purple">{v}</Tag>,
      },
      { title: t('adminRoles.fieldName'), dataIndex: 'name', key: 'name', width: 140 },
      {
        title: t('adminRoles.fieldDesc'),
        dataIndex: 'description',
        key: 'description',
        render: (v: string) => v || '—',
      },
      {
        title: t('adminRoles.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 160,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 260,
        render: (_, record) => (
          <div className="approval-actions">
            <Button type="link" size="small" onClick={() => openAssign(record)}>
              {t('adminRoles.assignPerms')}
            </Button>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openRoleEdit(record)}>
              {t('adminRoles.edit')}
            </Button>
            <Popconfirm
              title={t('adminRoles.deleteConfirm')}
              okText={t('adminRoles.delete')}
              cancelText={t('approval.cancel')}
              okButtonProps={{ danger: true, loading: actingId === record.id }}
              onConfirm={() => void doDeleteRole(record)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                {t('adminRoles.delete')}
              </Button>
            </Popconfirm>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, actingId],
  )

  const permColumns = useMemo<ColumnsType<PermInfo>>(
    () => [
      { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
      {
        title: t('adminRoles.fieldCode'),
        dataIndex: 'code',
        key: 'code',
        width: 180,
        render: (v: string) => <Tag color="geekblue">{v}</Tag>,
      },
      { title: t('adminRoles.fieldName'), dataIndex: 'name', key: 'name', width: 160 },
      {
        title: t('adminRoles.fieldDesc'),
        dataIndex: 'description',
        key: 'description',
        render: (v: string) => v || '—',
      },
      {
        title: t('adminRoles.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 160,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 200,
        render: (_, record) => (
          <div className="approval-actions">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openPermEdit(record)}>
              {t('adminRoles.edit')}
            </Button>
            <Popconfirm
              title={t('adminRoles.permDeleteConfirm')}
              okText={t('adminRoles.delete')}
              cancelText={t('approval.cancel')}
              okButtonProps={{ danger: true, loading: actingId === record.id }}
              onConfirm={() => void doDeletePerm(record)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                {t('adminRoles.delete')}
              </Button>
            </Popconfirm>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, actingId],
  )

  const assignColumns = useMemo<ColumnsType<PermInfo>>(
    () => [
      { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
      {
        title: t('adminRoles.fieldCode'),
        dataIndex: 'code',
        key: 'code',
        render: (v: string) => <Tag color="geekblue">{v}</Tag>,
      },
      { title: t('adminRoles.fieldName'), dataIndex: 'name', key: 'name' },
      {
        title: t('adminRoles.fieldDesc'),
        dataIndex: 'description',
        key: 'description',
        render: (v: string) => v || '—',
      },
    ],
    [t],
  )

  const assignDirty = useMemo(() => {
    if (assignSelected.length !== assignInitial.length) return true
    const init = new Set(assignInitial)
    return !assignSelected.every((id) => init.has(id))
  }, [assignSelected, assignInitial])

  return (
    <div className="student-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('adminRoles.title')}</h3>
        </header>
        <div className="panel-card-body">
          <Tabs
            defaultActiveKey="roles"
            items={[
              {
                key: 'roles',
                label: t('adminRoles.tabRoles'),
                children: (
                  <>
                    <div className="approval-toolbar" style={{ marginBottom: 12 }}>
                      <Input.Search
                        allowClear
                        className="admin-search"
                        placeholder={t('adminRoles.roleSearchPlaceholder')}
                        onSearch={(v: string) => {
                          setRolePage(1)
                          setRoleKeyword(v)
                        }}
                      />
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() =>
                          setRoleReload((r) => ({ seq: r.seq + 1, force: true }))
                        }
                      >
                        {t('common.refresh')}
                      </Button>
                      <Button type="primary" icon={<PlusOutlined />} onClick={openRoleCreate}>
                        {t('adminRoles.newRole')}
                      </Button>
                    </div>
                    {rolesError ? (
                      <Alert
                        type="error"
                        showIcon
                        title={
                          rolesError === 'network'
                            ? t('common.networkError')
                            : t('common.loadFailed')
                        }
                        action={
                          <Button
                            size="small"
                            onClick={() =>
                              setRoleReload((r) => ({ seq: r.seq + 1, force: true }))
                            }
                          >
                            {t('common.retry')}
                          </Button>
                        }
                      />
                    ) : (
                      <Table<RoleInfo>
                        rowKey="id"
                        loading={rolesLoading}
                        columns={roleColumns}
                        dataSource={roles}
                        locale={{ emptyText: t('common.noData') }}
                        pagination={{
                          current: rolePage,
                          pageSize: PAGE_SIZE,
                          total: roleTotal,
                          showSizeChanger: false,
                          showQuickJumper: true,
                          showTotal: (n: number) =>
                            `${t('common.total')} ${n} ${t('common.items')}`,
                          onChange: (p: number) => setRolePage(p),
                        }}
                      />
                    )}
                  </>
                ),
              },
              {
                key: 'permissions',
                label: t('adminRoles.tabPerms'),
                children: (
                  <>
                    <div className="approval-toolbar" style={{ marginBottom: 12 }}>
                      <Input.Search
                        allowClear
                        className="admin-search"
                        placeholder={t('adminRoles.permSearchPlaceholder')}
                        onSearch={(v: string) => {
                          setPermPage(1)
                          setPermKeyword(v)
                        }}
                      />
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() =>
                          setPermReload((r) => ({ seq: r.seq + 1, force: true }))
                        }
                      >
                        {t('common.refresh')}
                      </Button>
                      <Button type="primary" icon={<PlusOutlined />} onClick={openPermCreate}>
                        {t('adminRoles.newPerm')}
                      </Button>
                    </div>
                    {permsError ? (
                      <Alert
                        type="error"
                        showIcon
                        title={
                          permsError === 'network'
                            ? t('common.networkError')
                            : t('common.loadFailed')
                        }
                        action={
                          <Button
                            size="small"
                            onClick={() =>
                              setPermReload((r) => ({ seq: r.seq + 1, force: true }))
                            }
                          >
                            {t('common.retry')}
                          </Button>
                        }
                      />
                    ) : (
                      <Table<PermInfo>
                        rowKey="id"
                        loading={permsLoading}
                        columns={permColumns}
                        dataSource={perms}
                        locale={{ emptyText: t('common.noData') }}
                        pagination={{
                          current: permPage,
                          pageSize: PAGE_SIZE,
                          total: permTotal,
                          showSizeChanger: false,
                          showQuickJumper: true,
                          showTotal: (n: number) =>
                            `${t('common.total')} ${n} ${t('common.items')}`,
                          onChange: (p: number) => setPermPage(p),
                        }}
                      />
                    )}
                  </>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* 角色创建/编辑 */}
      <Modal
        open={roleModal !== null}
        title={roleModal?.mode === 'create' ? t('adminRoles.newRole') : t('adminRoles.editRole')}
        okText={t('adminRoles.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={roleSaving}
        onCancel={() => setRoleModal(null)}
        onOk={() => void submitRole()}
        destroyOnHidden
      >
        <Form form={roleForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="code"
            label={t('adminRoles.fieldCode')}
            rules={[{ required: true, message: t('adminRoles.codeRequired') }]}
          >
            <Input maxLength={64} placeholder={t('adminRoles.codePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('adminRoles.fieldName')}
            rules={[{ required: true, message: t('adminRoles.nameRequired') }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="description" label={t('adminRoles.fieldDesc')}>
            <Input.TextArea rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 权限创建/编辑 */}
      <Modal
        open={permModal !== null}
        title={permModal?.mode === 'create' ? t('adminRoles.newPerm') : t('adminRoles.editPerm')}
        okText={t('adminRoles.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={permSaving}
        onCancel={() => setPermModal(null)}
        onOk={() => void submitPerm()}
        destroyOnHidden
      >
        <Form form={permForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="code"
            label={t('adminRoles.fieldCode')}
            rules={[{ required: true, message: t('adminRoles.codeRequired') }]}
          >
            <Input maxLength={64} placeholder={t('adminRoles.permCodePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="name"
            label={t('adminRoles.fieldName')}
            rules={[{ required: true, message: t('adminRoles.nameRequired') }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="description" label={t('adminRoles.fieldDesc')}>
            <Input.TextArea rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 角色-权限分配 */}
      <Modal
        open={assignRole !== null}
        title={
          assignRole
            ? `${t('adminRoles.assignPermsTitle')}：${assignRole.name}（${assignRole.code}）`
            : t('adminRoles.assignPermsTitle')
        }
        width={720}
        okText={t('adminRoles.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={assignSaving}
        okButtonProps={{ disabled: !assignDirty }}
        onCancel={() => setAssignRole(null)}
        onOk={() => void submitAssign()}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          title={t('adminRoles.assignHint')}
          style={{ marginBottom: 12 }}
        />
        <Table<PermInfo>
          rowKey="id"
          size="small"
          loading={assignLoading}
          columns={assignColumns}
          dataSource={assignAllPerms}
          locale={{ emptyText: t('common.noData') }}
          pagination={false}
          scroll={{ y: 320 }}
          rowSelection={{
            selectedRowKeys: assignSelected,
            onChange: (keys: React.Key[]) => setAssignSelected(keys.map(Number)),
          }}
        />
      </Modal>
    </div>
  )
}
