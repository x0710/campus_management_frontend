import {
  DeleteOutlined,
  EditOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserAddOutlined,
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
import { useNavigate, useParams } from 'react-router'
import {
  addOrgMember,
  createOrganization,
  deleteOrganization,
  listAllOrganizations,
  queryOrgMembers,
  removeOrgMember,
  updateOrganization,
} from '../../api/organizations'
import type {
  OrganizationInfo,
  OrganizationMember,
} from '../../api/types/organizations'
import { queryPositions } from '../../api/positions'
import type { PositionDetail } from '../../api/types/positions'
import { extractErrorReason } from '../../api/common'
import ErrorState from '../../components/ErrorState'
import MemberSearchNav from '../../components/MemberSearchNav'
import PersonSearchBox from '../../components/PersonSearchBox'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { useMemberSearch } from '../../composables/useMemberSearch'
import { usePositionNames } from '../../composables/usePositionNames'
import { useUserNames } from '../../composables/useUserNames'
import { useUserOrganizations } from '../../composables/useUserOrganizations'
import { useT } from '../../i18n'
import { useUiStateStore } from '../../store/uiState'

/** 组织成员表每页条数（代码要求 12：表格每页最多 100 行） */
const MEMBER_PAGE_SIZE = 100

interface OrgFormValues {
  code: string
  name: string
  parent_id: number | null
}

interface OrgAdminViewProps {
  /**
   * 组织选中态的会话缓存 key。
   * 管理端与党委学校端复用同一页面时各用一个 key，避免两端的选择状态互相串用。
   */
  uiKey?: string
}

/** 管理端：组织架构（组织树 + 组织 CRUD + 成员任职管理，成员详情跳转共用领导端成员详情页） */
export default function OrgAdminView({ uiKey = 'admin_m3' }: OrgAdminViewProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()

  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  // 选中组织 ID 存入 Zustand 会话状态，切换路由回来后仍保留
  const selectedId = useUiStateStore((s) => s.selectedOrgIds[uiKey] ?? null)
  const setSelectedId = useUiStateStore((s) => s.setSelectedOrgId)
  // 左侧组织树的收起状态（按模块 key 记忆，跨路由返回仍保持）
  const treeCollapsed = useUiStateStore((s) => s.collapsedOrgTrees[uiKey] ?? false)
  const setTreeCollapsed = useUiStateStore((s) => s.setOrgTreeCollapsed)
  // 已展开的树节点（按模块 key 记忆，切走再回来仍保持刚刚查看的展开状态）
  const storedExpandedKeys = useUiStateStore((s) => s.expandedOrgTreeKeys[uiKey])
  const setOrgTreeExpanded = useUiStateStore((s) => s.setOrgTreeExpanded)

  // 组织搜索关键词（仅前端过滤树节点）
  const [orgSearch, setOrgSearch] = useState('')

  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberPage, setMemberPage] = useState(1)
  const [memberTotal, setMemberTotal] = useState(0)
  const [actingKey, setActingKey] = useState<string | null>(null)

  const [positions, setPositions] = useState<PositionDetail[]>([])

  const [orgModal, setOrgModal] = useState<
    { mode: 'create' | 'edit'; org?: OrganizationInfo } | null
  >(null)
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgForm] = Form.useForm<OrgFormValues>()

  const [newMember, setNewMember] = useState<{
    user_id: number | null
    position: string
    workplace: string
  }>({ user_id: null, position: '', workplace: '' })
  const [addingMember, setAddingMember] = useState(false)
  /** 新增成员弹窗开关（成员操作收进弹窗，避免与表头上方的搜索框混在一起） */
  const [addModalOpen, setAddModalOpen] = useState(false)

  const reportError = useErrorFeedback()

  const loadOrgs = useCallback(async (force?: boolean) => {
    setOrgsLoading(true)
    setOrgsError(null)
    try {
      const list = await listAllOrganizations(force)
      setOrgs(list)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setOrgsError(extractErrorReason(err, t))
      }
    } finally {
      setOrgsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadOrgs()
  }, [loadOrgs])

  // 职位列表供「添加成员」弹窗的职位自动补全使用（加载失败不阻塞，仍可手填）
  useEffect(() => {
    void (async () => {
      try {
        const res = await queryPositions({ page: 1, page_size: 100 })
        setPositions(res.data)
      } catch {
        // 忽略：无 position.read 权限时保留空选项
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
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) reportError(err)
      } finally {
        setMembersLoading(false)
      }
    },
    [reportError],
  )

  // 成员 ID 搜索：定位所属组织 → 展开并选中该组织 → 高亮命中成员行（逻辑见 useMemberSearch）
  const search = useMemberSearch({
    orgs,
    memberPageSize: MEMBER_PAGE_SIZE,
    activeOrgId: selectedId,
    onSelectOrg: (orgId: number) => setSelectedId(uiKey, orgId),
    onClearFilter: () => setOrgSearch(''),
    onLoadPage: (orgId: number, page: number) => {
      setMemberPage(page)
      void loadMembers(orgId, page)
    },
    memberRows: members,
  })
  const { consumePendingPage } = search

  // 组织树默认只展开根节点（进入页面不全量展开，避免树过长铺满；深层分支点击再展开）
  const rootKeys = useMemo<React.Key[]>(
    () => orgs.filter((o) => o.parent_id === null).map((o) => o.id),
    [orgs],
  )
  // 展开节点：搜索命中时展开到目标组织链；否则用上次手动展开的节点（跨路由保留）；再否则只展开根节点
  const expandedKeys = useMemo<React.Key[]>(
    () => search.focusKeys ?? storedExpandedKeys ?? rootKeys,
    [search.focusKeys, storedExpandedKeys, rootKeys],
  )

  // 切换组织后加载成员：默认回到第 1 页；若为搜索命中则按目标页加载
  useEffect(() => {
    if (selectedId !== null) {
      const targetPage = consumePendingPage()
      setMemberPage(targetPage)
      void loadMembers(selectedId, targetPage)
    } else {
      setMembers([])
      setMemberTotal(0)
    }
  }, [selectedId, loadMembers, consumePendingPage])

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
  // 职位编码 → 职位名称（成员接口只返回编码，展示时映射为名称，未命中回退编码）
  const positionNames = usePositionNames()

  const onSelectTree: TreeProps['onSelect'] = (keys: React.Key[]) => {
    setSelectedId(uiKey, keys.length ? Number(keys[0]) : null)
  }

  // 点击成员行 / 「查看详细」跳转到成员详情页（与领导端「组织概览」共用同一页面，
  // from=uiKey 让侧栏仍高亮当前组织模块，返回时回到本页）
  const openMemberDetail = useCallback(
    (uid: number) => {
      navigate(`/portal/${portalKey}/organization-members/${uid}?from=${uiKey}`)
    },
    [navigate, portalKey, uiKey],
  )

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
      reportError(err)
    } finally {
      setOrgSaving(false)
    }
  }

  const removeOrg = async (org: OrganizationInfo) => {
    setActingKey(`org-${org.id}`)
    try {
      await deleteOrganization(org.id)
      message.success(t('adminOrg.deleteSuccess'))
      if (selectedId === org.id) setSelectedId(uiKey, null)
      await loadOrgs()
    } catch (err) {
      reportError(err)
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
      setAddModalOpen(false)
      await loadMembers(selectedId, memberPage)
    } catch (err) {
      reportError(err)
    } finally {
      setAddingMember(false)
    }
  }

  const removeMember = async (member: OrganizationMember) => {
    if (selectedId === null) return
    setActingKey(`member-${member.id}`)
    try {
      await removeOrgMember(selectedId, member.id)
      message.success(t('adminOrg.memberRemoveSuccess'))
      await loadMembers(selectedId, memberPage)
    } catch (err) {
      reportError(err)
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
        title: t('profile.name'),
        key: 'user_name',
        width: 130,
        render: (_, record) =>
          memberNames.has(record.user_id)
            ? (memberNames.get(record.user_id) ?? '—')
            : t('common.loading'),
      },
      {
        // 用户的全部任职组织（当前组织高亮），数据来自 GET /organization-members?uids=
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
        // 显示职位名称（映射失败时回退编码），悬停展示原始编码便于核对
        render: (v: string) => (
          <Tooltip title={v}>
            <Tag color="blue">{positionNames.get(v) ?? v}</Tag>
          </Tooltip>
        ),
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
                onClick={() => openMemberDetail(record.user_id)}
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
                loading: actingKey === `member-${record.id}`,
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
    [t, actingKey, memberNames, memberOrgs, positionNames, selectedId, openMemberDetail],
  )

  return (
    <div className={`admin-org-view${treeCollapsed ? ' is-tree-collapsed' : ''}`}>
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
            <ErrorState message={orgsError} />
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
                {/* 以「数据是否就绪」作为 key：组织数据到达后强制重挂载 Tree。
                    rc-tree 在 treeData 为空（数据未加载）时挂载会忽略随后传入的受控
                    expandedKeys，导致切走再返回组织树时展开态丢失；重挂载后可正常生效。 */}
                <Tree
                  key={(treeData?.length ?? 0) > 0 ? 'tree-loaded' : 'tree-empty'}
                  treeData={treeData}
                  expandedKeys={expandedKeys}
                  onExpand={(keys: React.Key[]) => {
                    search.setFocusKeys(keys)
                    setOrgTreeExpanded(uiKey, keys.map((k) => Number(k)))
                  }}
                  selectedKeys={selectedId !== null ? [selectedId] : []}
                  onSelect={onSelectTree}
                  showLine
                  blockNode
                />
              </Spin>
            </>
          )}
        </div>
      </section>

      <section className="panel-card org-members-card">
        {/* 表头固定：标题 + 操作按钮在第一行，搜索框在第二行；
            表格在卡片体内独立滚动，下滑时标题与搜索框始终可见 */}
        <header className="panel-card-header org-member-header">
          <div className="org-members-title">
            {/* 左侧组织树收起/展开 */}
            <Tooltip
              title={
                treeCollapsed ? t('memberDetail.expandTree') : t('memberDetail.collapseTree')
              }
            >
              <Button
                type="text"
                size="small"
                aria-label={
                  treeCollapsed ? t('memberDetail.expandTree') : t('memberDetail.collapseTree')
                }
                icon={treeCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setTreeCollapsed(uiKey, !treeCollapsed)}
              />
            </Tooltip>
            <h3 className="panel-card-title">
              {selectedOrg
                ? `${selectedOrg.name}（${selectedOrg.code}）`
                : t('adminOrg.detailTitle')}
            </h3>
          </div>
          {selectedOrg && (
            <div className="approval-toolbar">
              {/* 添加成员与搜索框分处表头/表体，避免被误认成搜索按钮 */}
              <Button
                type="primary"
                size="small"
                icon={<UserAddOutlined />}
                onClick={() => setAddModalOpen(true)}
              >
                {t('adminOrg.addMember')}
              </Button>
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
          {/* 成员 ID 搜索（固定在表头内，随卡片表头始终可见，不随表格滚动） */}
          <div className="org-member-actions">
            <PersonSearchBox
              width={320}
              value={search.query}
              onChange={search.setQuery}
              onSearch={search.run}
              loading={search.searching}
            />
            {/* 姓名模糊匹配到多人时：紧邻搜索框展示匹配总数 + 上一个 / 下一个，不遮挡成员表 */}
            <MemberSearchNav
              visible={search.resultVisible}
              total={search.resultTotal}
              index={search.matchIndex}
              loading={search.searching}
              canPrev={search.hasPrev}
              canNext={search.hasNext}
              onPrev={search.showPrev}
              onNext={search.showNext}
            />
          </div>
        </header>
        <div className="panel-card-body">
          {!selectedOrg ? (
            <Alert type="info" showIcon title={t('adminOrg.selectHint')} />
          ) : (
            <>
              <Table<OrganizationMember>
                rowKey={(r: OrganizationMember) => String(r.id)}
                loading={membersLoading}
                columns={memberColumns}
                dataSource={members}
                // 搜索命中的成员所在行高亮（夜间配色见 index.css 的 .org-member-row-hit）
                rowClassName={(record: OrganizationMember) =>
                  record.user_id === search.hitUid ? 'org-member-row-hit' : ''
                }
                locale={{ emptyText: t('common.noData') }}
                scroll={{ x: 960 }}
                onRow={(record: OrganizationMember) => ({
                  onClick: (e: React.MouseEvent) => {
                    // 点击按钮/链接时不触发行点击
                    const target = e.target as HTMLElement
                    if (target.closest('button') || target.closest('.ant-popover')) return
                    openMemberDetail(record.user_id)
                  },
                  title: t('memberDetail.rowClickHint'),
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

      {/* 添加成员弹窗：UID + 职位 + 工作地点，成功提交后关闭并刷新成员列表 */}
      <Modal
        open={addModalOpen}
        title={`${t('adminOrg.addMember')}${selectedOrg ? ` · ${selectedOrg.name}` : ''}`}
        okText={t('adminOrg.addMember')}
        cancelText={t('approval.cancel')}
        confirmLoading={addingMember}
        okButtonProps={{
          disabled: newMember.user_id === null || !newMember.position.trim(),
        }}
        onCancel={() => setAddModalOpen(false)}
        onOk={() => void addMember()}
        forceRender
        destroyOnHidden
      >
        <Form layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label={t('adminOrg.colUserId')}>
            <InputNumber
              style={{ width: '100%' }}
              placeholder={t('adminOrg.userIdPlaceholder')}
              min={1}
              precision={0}
              value={newMember.user_id}
              onChange={(v: number | null) =>
                setNewMember((s) => ({ ...s, user_id: v === null ? null : Number(v) }))
              }
            />
          </Form.Item>
          <Form.Item label={t('adminOrg.colPosition')}>
            <AutoComplete
              style={{ width: '100%' }}
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
          </Form.Item>
          <Form.Item label={t('adminOrg.colWorkplace')}>
            <Input
              placeholder={t('adminOrg.workplacePlaceholder')}
              value={newMember.workplace}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setNewMember((s) => ({ ...s, workplace: e.target.value }))
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
