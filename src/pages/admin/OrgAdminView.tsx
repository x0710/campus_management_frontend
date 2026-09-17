import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  AutoComplete,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Spin,
  Table,
  Tag,
  Tooltip,
  Tree,
  TreeSelect,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { TreeProps } from 'antd/es/tree'
import axios from 'axios'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react'
import {
  addOrgMember,
  createOrganization,
  deleteOrganization,
  listAllOrganizations,
  queryOrgMembers,
  removeOrgMember,
  updateOrganization,
  type OrganizationInfo,
  type OrganizationMember,
} from '../../api/organizations'
import { queryPositions, type PositionDetail } from '../../api/positions'
import { queryRoles, type RoleInfo } from '../../api/rbac'
import { extractError } from '../../api/common'
import { useUserNames } from '../../composables/useUserNames'
import { useUserOrganizations } from '../../composables/useUserOrganizations'
import { useT } from '../../i18n'
import { useUiStateStore } from '../../store/uiState'
import UserEditPanel from './UserEditPanel'

const MEMBER_PAGE_SIZE = 10

interface OrgFormValues {
  code: string
  name: string
  parent_id: number | null
}

/** 管理端：组织架构（组织树 + 组织 CRUD + 成员任职管理） */
export default function OrgAdminView() {
  const t = useT()
  const { message } = AntdApp.useApp()

  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  // 选中组织 ID 存入 Zustand 会话状态，切换路由回来后仍保留
  const selectedId = useUiStateStore((s) => s.selectedOrgId)
  const setSelectedId = useUiStateStore((s) => s.setSelectedOrgId)

  // 组织搜索关键词（仅前端过滤树节点）
  const [orgSearch, setOrgSearch] = useState('')

  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberPage, setMemberPage] = useState(1)
  const [memberTotal, setMemberTotal] = useState(0)
  const [actingKey, setActingKey] = useState<string | null>(null)

  const [positions, setPositions] = useState<PositionDetail[]>([])
  const [roles, setRoles] = useState<RoleInfo[]>([])

  const [orgModal, setOrgModal] = useState<
    { mode: 'create' | 'edit'; org?: OrganizationInfo } | null
  >(null)
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgForm] = Form.useForm<OrgFormValues>()

  // 点击成员行打开的用户详情弹窗
  const [editUid, setEditUid] = useState<number | null>(null)

  const [newMember, setNewMember] = useState<{
    user_id: number | null
    position: string
    workplace: string
  }>({ user_id: null, position: '', workplace: '' })
  const [addingMember, setAddingMember] = useState(false)

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

  const loadOrgs = useCallback(async (force?: boolean) => {
    setOrgsLoading(true)
    setOrgsError(null)
    try {
      const list = await listAllOrganizations(force)
      setOrgs(list)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setOrgsError(extractError(err))
      }
    } finally {
      setOrgsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOrgs()
  }, [loadOrgs])

  useEffect(() => {
    void (async () => {
      try {
        const [posRes, roleRes] = await Promise.all([
          queryPositions({ page: 1, page_size: 100 }),
          queryRoles({ page: 1, page_size: 100 }),
        ])
        setPositions(posRes.data)
        setRoles(roleRes.data)
      } catch {
        // 职位/角色列表加载失败不阻塞，表单仍可手填
      }
    })()
  }, [])

  const loadMembers = useCallback(
    async (orgId: number, page: number, force?: boolean) => {
      setMembersLoading(true)
      try {
        const res = await queryOrgMembers(
          orgId,
          { page, page_size: MEMBER_PAGE_SIZE },
          force,
        )
        setMembers(res.data)
        setMemberTotal(res.total)
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) showError(err)
      } finally {
        setMembersLoading(false)
      }
    },
    [showError],
  )

  useEffect(() => {
    if (selectedId !== null) {
      setMemberPage(1)
      void loadMembers(selectedId, 1)
    } else {
      setMembers([])
      setMemberTotal(0)
    }
  }, [selectedId, loadMembers])

  // parent_id -> children 组树（搜索关键词仅前端过滤名称/编码）
  const treeData = useMemo<TreeProps['treeData']>(() => {
    const kw = orgSearch.trim().toLowerCase()
    const filtered = kw
      ? orgs.filter(
          (o) =>
            o.name.toLowerCase().includes(kw) || o.code.toLowerCase().includes(kw),
        )
      : orgs
    // 保留匹配节点的祖先链，使树结构完整
    const visible = new Set<number>()
    for (const o of filtered) {
      let cur: OrganizationInfo | undefined = o
      while (cur) {
        visible.add(cur.id)
        cur = cur.parent_id != null ? orgs.find((x) => x.id === cur!.parent_id) : undefined
      }
    }
    const byParent = new Map<number | null, OrganizationInfo[]>()
    for (const o of orgs) {
      if (kw && !visible.has(o.id)) continue
      const key = o.parent_id
      const arr = byParent.get(key)
      if (arr) arr.push(o)
      else byParent.set(key, [o])
    }
    const build = (list?: OrganizationInfo[]): NonNullable<TreeProps['treeData']> =>
      (list ?? []).map((o) => ({
        key: o.id,
        title: `${o.name}（${o.code}）`,
        children: build(byParent.get(o.id)),
      }))
    return build(byParent.get(null))
  }, [orgs, orgSearch])

  const parentOptions = useMemo(
    () =>
      orgs.map((o) => ({
        value: o.id,
        title: `${o.name}（${o.code}）`,
      })),
    [orgs],
  )

  const positionOptions = useMemo(
    () => positions.map((p) => ({ value: p.code, label: `${p.name}（${p.code}）` })),
    [positions],
  )

  const selectedOrg = useMemo(
    () => orgs.find((o) => o.id === selectedId) ?? null,
    [orgs, selectedId],
  )

  // 当前成员页内的用户 ID → 姓名 / 任职组织（均走会话缓存，相同 ID 不重复请求）
  const memberIds = useMemo(() => members.map((m) => m.user_id), [members])
  const memberNames = useUserNames(memberIds)
  const memberOrgs = useUserOrganizations(memberIds)

  const onSelectTree: TreeProps['onSelect'] = (keys: React.Key[]) => {
    setSelectedId(keys.length ? Number(keys[0]) : null)
  }

  const openCreate = (parent?: OrganizationInfo) => {
    setOrgModal({ mode: 'create' })
    orgForm.setFieldsValue({
      code: '',
      name: '',
      parent_id: parent ? parent.id : selectedId,
    })
  }

  const openEdit = (org: OrganizationInfo) => {
    setOrgModal({ mode: 'edit', org })
    orgForm.setFieldsValue({ code: org.code, name: org.name, parent_id: org.parent_id })
  }

  const submitOrg = async () => {
    const values = await orgForm.validateFields()
    if (!orgModal) return
    setOrgSaving(true)
    try {
      if (orgModal.mode === 'create') {
        await createOrganization({
          code: values.code.trim(),
          name: values.name.trim(),
          parent_id: values.parent_id ?? null,
        })
        message.success(t('adminOrg.createSuccess'))
      } else {
        await updateOrganization(orgModal.org!.id, {
          code: values.code.trim(),
          name: values.name.trim(),
          parent_id: values.parent_id ?? null,
        })
        message.success(t('adminOrg.updateSuccess'))
      }
      setOrgModal(null)
      await loadOrgs()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      showError(err)
    } finally {
      setOrgSaving(false)
    }
  }

  const removeOrg = async (org: OrganizationInfo) => {
    setActingKey(`org-${org.id}`)
    try {
      await deleteOrganization(org.id)
      message.success(t('adminOrg.deleteSuccess'))
      if (selectedId === org.id) setSelectedId(null)
      await loadOrgs()
    } catch (err) {
      showError(err)
    } finally {
      setActingKey(null)
    }
  }

  const addMember = async () => {
    if (selectedId === null || newMember.user_id === null || !newMember.position.trim()) return
    setAddingMember(true)
    try {
      await addOrgMember(selectedId, {
        user_id: newMember.user_id,
        position: newMember.position.trim(),
        workplace: newMember.workplace.trim() || null,
      })
      message.success(t('adminOrg.memberAddSuccess'))
      setNewMember({ user_id: null, position: '', workplace: '' })
      await loadMembers(selectedId, memberPage)
    } catch (err) {
      showError(err)
    } finally {
      setAddingMember(false)
    }
  }

  const removeMember = async (member: OrganizationMember) => {
    if (selectedId === null) return
    setActingKey(`member-${member.user_id}-${member.position}`)
    try {
      await removeOrgMember(selectedId, member)
      message.success(t('adminOrg.memberRemoveSuccess'))
      await loadMembers(selectedId, memberPage)
    } catch (err) {
      showError(err)
    } finally {
      setActingKey(null)
    }
  }

  const memberColumns = useMemo<ColumnsType<OrganizationMember>>(
    () => [
      {
        title: 'UID',
        dataIndex: 'user_id',
        key: 'user_id',
        width: 80,
      },
      {
        // 通过 GET /api/users/{id} 解析出的真实姓名
        title: t('adminOrg.colUserName'),
        key: 'user_name',
        width: 130,
        render: (_, record) =>
          memberNames.has(record.user_id)
            ? (memberNames.get(record.user_id) ?? '—')
            : t('common.loading'),
      },
      {
        // 用户的全部任职组织（当前组织高亮），数据来自 GET /organizations/users/{uid}
        title: t('adminOrg.colUserOrg'),
        key: 'user_orgs',
        width: 220,
        render: (_, record) => {
          if (!memberOrgs.has(record.user_id)) {
            return <span className="cell-sub">{t('common.loading')}</span>
          }
          const list = memberOrgs.get(record.user_id) ?? []
          if (list.length === 0) return <span className="cell-sub">—</span>
          return (
            <span className="org-member-tags">
              {list.map((o) => (
                <Tag
                  key={`${o.organization_id}-${o.position}`}
                  color={o.organization_id === selectedId ? 'blue' : 'default'}
                  title={o.organization_name}
                >
                  {o.organization_name}
                </Tag>
              ))}
            </span>
          )
        },
      },
      {
        title: t('adminOrg.colPosition'),
        dataIndex: 'position',
        key: 'position',
        width: 160,
        render: (v: string) => <Tag color="blue">{v}</Tag>,
      },
      {
        title: t('adminOrg.colWorkplace'),
        dataIndex: 'workplace',
        key: 'workplace',
        render: (v: string | null) => v || '—',
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 140,
        render: (_, record) => (
          <div className="approval-actions">
            <Tooltip title={t('adminOrg.viewUser')}>
              <Button
                type="link"
                size="small"
                onClick={() => setEditUid(record.user_id)}
              >
                {t('adminOrg.viewUser')}
              </Button>
            </Tooltip>
            <Popconfirm
              title={t('adminOrg.memberRemoveConfirm')}
              okText={t('adminOrg.remove')}
              cancelText={t('approval.cancel')}
              okButtonProps={{
                danger: true,
                loading: actingKey === `member-${record.user_id}-${record.position}`,
              }}
              onConfirm={() => void removeMember(record)}
            >
              <Button type="link" size="small" danger>
                {t('adminOrg.remove')}
              </Button>
            </Popconfirm>
          </div>
        ),
      },
    ],
    [t, actingKey, memberNames, memberOrgs, selectedId],
  )

  return (
    <div className="admin-org-view">
      <section className="panel-card org-tree-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('adminOrg.treeTitle')}</h3>
          <div className="approval-toolbar">
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => openCreate()}
            >
              {t('adminOrg.newOrg')}
            </Button>
            <Tooltip title={t('common.refresh')}>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadOrgs(true)} />
            </Tooltip>
          </div>
        </header>
        <div className="panel-card-body">
          {orgsError ? (
            <Alert
              type="error"
              showIcon
              title={
                orgsError === 'network' ? t('common.networkError') : t('common.loadFailed')
              }
            />
          ) : (
            <>
              <Input.Search
                allowClear
                size="small"
                style={{ marginBottom: 8 }}
                prefix={<SearchOutlined />}
                placeholder={t('adminOrg.searchPlaceholder')}
                value={orgSearch}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgSearch(e.target.value)}
              />
              <Spin spinning={orgsLoading}>
                <Tree
                  treeData={treeData}
                  selectedKeys={selectedId !== null ? [selectedId] : []}
                  onSelect={onSelectTree}
                  showLine
                  blockNode
                  defaultExpandAll
                />
              </Spin>
            </>
          )}
        </div>
      </section>

      <section className="panel-card org-members-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">
            {selectedOrg
              ? `${selectedOrg.name}（${selectedOrg.code}）`
              : t('adminOrg.detailTitle')}
          </h3>
          {selectedOrg && (
            <div className="approval-toolbar">
              <Tooltip title={t('common.refresh')}>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => void loadMembers(selectedOrg.id, memberPage, true)}
                />
              </Tooltip>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate(selectedOrg)}>
                {t('adminOrg.newSubOrg')}
              </Button>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(selectedOrg)}
              >
                {t('adminOrg.editOrg')}
              </Button>
              <Popconfirm
                title={t('adminOrg.orgDeleteConfirm')}
                okText={t('adminOrg.delete')}
                cancelText={t('approval.cancel')}
                okButtonProps={{
                  danger: true,
                  loading: actingKey === `org-${selectedOrg.id}`,
                }}
                onConfirm={() => void removeOrg(selectedOrg)}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  {t('adminOrg.delete')}
                </Button>
              </Popconfirm>
            </div>
          )}
        </header>
        <div className="panel-card-body">
          {!selectedOrg ? (
            <Alert type="info" showIcon title={t('adminOrg.selectHint')} />
          ) : (
            <>
              <div className="org-add-member">
                <InputNumber
                  className="org-add-member-uid"
                  placeholder={t('adminOrg.userIdPlaceholder')}
                  min={1}
                  precision={0}
                  value={newMember.user_id}
                  onChange={(v: number | null) =>
                    setNewMember((s) => ({ ...s, user_id: v === null ? null : Number(v) }))
                  }
                />
                <AutoComplete
                  className="org-add-member-pos"
                  options={positionOptions}
                  placeholder={t('adminOrg.positionPlaceholder')}
                  value={newMember.position}
                  onChange={(v: string) => setNewMember((s) => ({ ...s, position: v }))}
                  filterOption={(input: string, option?: { label?: unknown }) =>
                    String(option?.label ?? '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  allowClear
                />
                <Input
                  className="org-add-member-place"
                  placeholder={t('adminOrg.workplacePlaceholder')}
                  value={newMember.workplace}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setNewMember((s) => ({ ...s, workplace: e.target.value }))
                  }
                />
                <Button
                  type="primary"
                  loading={addingMember}
                  disabled={newMember.user_id === null || !newMember.position.trim()}
                  onClick={() => void addMember()}
                >
                  {t('adminOrg.addMember')}
                </Button>
              </div>

              <Table<OrganizationMember>
                rowKey={(_r: OrganizationMember, i: number | undefined) =>
                  `${_r.user_id}-${_r.position}-${i ?? 0}`
                }
                loading={membersLoading}
                columns={memberColumns}
                dataSource={members}
                locale={{ emptyText: t('common.noData') }}
                scroll={{ x: 960 }}
                onRow={(record: OrganizationMember) => ({
                  onClick: (e: React.MouseEvent) => {
                    // 点击按钮/链接时不触发行点击
                    const target = e.target as HTMLElement
                    if (target.closest('button') || target.closest('.ant-popover')) return
                    setEditUid(record.user_id)
                  },
                  style: { cursor: 'pointer' },
                })}
                pagination={{
                  current: memberPage,
                  pageSize: MEMBER_PAGE_SIZE,
                  total: memberTotal,
                  showSizeChanger: false,
                  showQuickJumper: true,
                  showTotal: (n: number) =>
                    `${t('common.total')} ${n} ${t('common.items')}`,
                  onChange: (p: number) => {
                    setMemberPage(p)
                    void loadMembers(selectedOrg.id, p)
                  },
                }}
              />
            </>
          )}
        </div>
      </section>

      <Modal
        open={orgModal !== null}
        title={orgModal?.mode === 'create' ? t('adminOrg.newOrg') : t('adminOrg.editOrg')}
        okText={t('adminOrg.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={orgSaving}
        onCancel={() => setOrgModal(null)}
        onOk={() => void submitOrg()}
        forceRender
        destroyOnHidden
      >
        <Form form={orgForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label={t('adminOrg.fieldName')}
            rules={[{ required: true, message: t('adminOrg.nameRequired') }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="code"
            label={t('adminOrg.fieldCode')}
            rules={[{ required: true, message: t('adminOrg.codeRequired') }]}
          >
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item name="parent_id" label={t('adminOrg.fieldParent')}>
            <TreeSelect
              treeData={parentOptions}
              treeDefaultExpandAll
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder={t('adminOrg.parentPlaceholder')}
              onChange={(v: number | undefined) =>
                orgForm.setFieldValue('parent_id', v ?? null)
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 点击成员行打开用户详情弹窗，复用 UserEditPanel */}
      <Modal
        open={editUid !== null}
        title={editUid !== null ? `${t('adminOrg.viewUser')} #${editUid}` : ''}
        width={760}
        footer={null}
        onCancel={() => setEditUid(null)}
        destroyOnHidden
      >
        {editUid !== null && (
          <UserEditPanel
            uid={editUid}
            roles={roles}
            organizations={orgs}
            positions={positions}
            onChanged={() => {
              if (selectedId !== null) {
                void loadMembers(selectedId, memberPage, true)
              }
            }}
          />
        )}
      </Modal>
    </div>
  )
}
