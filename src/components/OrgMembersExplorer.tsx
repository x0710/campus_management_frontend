/**
 * 组织成员浏览器（可复用组件，代码要求 1）：
 * 左侧「组织树（可搜索）」+ 右侧「成员表（支持翻页/跳页/总数）」，
 * 点击成员行或「详情」按钮跳转到成员详情页（成绩/请假/违规信息，代码要求 14）。
 *
 * 由领导端「组织概览」抽出，老师端「班级管理」复用同一套界面：
 * - 领导端传入全部组织（listAllOrganizations）；
 * - 老师端传入本人所在组织（listUserOrganizations），接口与数据范围都不变；
 * - 党委学院端「学院支部管理」传入本学院子树并保留组织树；
 * - 党委支部端「支部管理」传 showOrgTree=false（支部为最底层组织，无需树），仅展示成员表。
 *
 * 成员 ID 搜索（各门户通用，逻辑见 composables/useMemberSearch）：输入用户 ID 后经
 * GET /api/organization-members?uids= 定位其所属组织 → 展开组织树到该组织并选中
 * （无组织树时固定选中唯一组织）→ 高亮该成员所在行；目标不在第 1 页时自动跳到其所在页。
 *
 * 组织数据由父组件加载后传入（不同门户数据范围不同），本组件只负责组织树渲染、
 * 成员分页查询与跳转；成员查询走会话缓存，刷新传 force=true 绕过缓存（代码要求 5）。
 */
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Alert, Button, Input, Spin, Table, Tag, Tooltip, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { TreeProps } from 'antd/es/tree'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { extractErrorReason } from '../api/common'
import { queryOrgMembers } from '../api/organizations'
import type { OrganizationMember } from '../api/types/organizations'
import { useMemberSearch } from '../composables/useMemberSearch'
import { usePositionNames } from '../composables/usePositionNames'
import { useUserNames } from '../composables/useUserNames'
import { LEADER_ORG_MEMBER_PAGE_SIZE } from '../config/leaderOrg'
import { useT } from '../i18n'
import { useUiStateStore } from '../store/uiState'
import ErrorState from './ErrorState'
import PersonSearchBox from './PersonSearchBox'

/** 组织树节点所需的最小组织信息（领导端传 OrganizationInfo，老师端传本人任职组织） */
export interface OrgNode {
  /** 组织 ID（必填） */
  id: number
  /** 组织名称（必填） */
  name: string
  /** 组织编码（可选，展示用；为空或与名称相同时不重复展示） */
  code?: string
  /** 上级组织 ID（可选，缺省视为根节点） */
  parent_id?: number | null
}

interface OrgMembersExplorerProps {
  /** 待展示的组织列表（必填，由父组件按各自数据范围加载） */
  orgs: OrgNode[]
  /** 组织是否加载中（必填） */
  orgsLoading: boolean
  /** 组织加载失败文案（必填，null 表示无错误；文案已含状态码与中文原因） */
  orgsError: string | null
  /** 重新加载组织（必填；force=true 绕过会话缓存） */
  onReloadOrgs: (force?: boolean) => void
  /** 侧栏高亮与详情页返回目标使用的模块 key（必填，如 'leader_m3'、'teacher_m3'） */
  fromModuleKey: string
  /** 成员表每页条数（可选，默认 LEADER_ORG_MEMBER_PAGE_SIZE = 100） */
  memberPageSize?: number
  /** 组织加载完成后是否自动选中第一个组织（可选，默认 false） */
  autoSelectFirst?: boolean
  /**
   * 是否展示左侧组织树（可选，默认 true）。
   * 置为 false 时隐藏组织树与组织切换，仅展示唯一组织（orgs[0]）的成员表，
   * 适用于「支部」等最底层组织（无下级组织，无需树形切换）。
   */
  showOrgTree?: boolean
}

export default function OrgMembersExplorer({
  orgs,
  orgsLoading,
  orgsError,
  onReloadOrgs,
  fromModuleKey,
  memberPageSize = LEADER_ORG_MEMBER_PAGE_SIZE,
  autoSelectFirst = false,
  showOrgTree = true,
}: OrgMembersExplorerProps) {
  const t = useT()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()

  const [orgSearch, setOrgSearch] = useState('')
  const selectedId = useUiStateStore((s) => s.selectedOrgIds[fromModuleKey] ?? null)
  const setSelectedId = useUiStateStore((s) => s.setSelectedOrgId)
  // 左侧组织树的收起状态（按模块 key 记忆，跨路由返回仍保持）
  const treeCollapsed = useUiStateStore((s) => s.collapsedOrgTrees[fromModuleKey] ?? false)
  const setTreeCollapsed = useUiStateStore((s) => s.setOrgTreeCollapsed)
  // 已展开的树节点（按模块 key 记忆，切走再回来仍保持刚刚查看的展开状态）
  const storedExpandedKeys = useUiStateStore((s) => s.expandedOrgTreeKeys[fromModuleKey])
  const setOrgTreeExpanded = useUiStateStore((s) => s.setOrgTreeExpanded)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [memberPage, setMemberPage] = useState(1)
  const [memberTotal, setMemberTotal] = useState(0)

  /** 加载指定组织的成员（force=true 绕过会话缓存） */
  const loadMembers = useCallback(
    async (orgId: number, page: number, force?: boolean) => {
      setMembersLoading(true)
      setMembersError(null)
      try {
        const res = await queryOrgMembers(orgId, { page, page_size: memberPageSize }, force)
        setMembers(res.data)
        setMemberTotal(res.total)
      } catch (err) {
        // 401 由 http 拦截器统一处理登录态，此处不重复提示
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setMembersError(extractErrorReason(err, t))
        }
      } finally {
        setMembersLoading(false)
      }
    },
    [memberPageSize, t],
  )

  // 实际查询成员的组织：
  // 展示组织树时取用户在树中选中的组织；不展示组织树时固定为唯一组织（orgs[0]）
  const activeOrgId = showOrgTree ? selectedId : (orgs[0]?.id ?? null)

  // 自动选中首个组织（老师端/学院端通常只有一个/少数组织，避免多一次点击）
  useEffect(() => {
    if (!showOrgTree) return
    if (autoSelectFirst && selectedId === null && orgs.length > 0) {
      setSelectedId(fromModuleKey, orgs[0].id)
    }
  }, [showOrgTree, autoSelectFirst, orgs, selectedId, fromModuleKey, setSelectedId])

  // 成员 ID 搜索：定位所属组织 → 展开并选中该组织 → 高亮命中成员行（逻辑见 useMemberSearch）
  const search = useMemberSearch({
    orgs,
    memberPageSize,
    activeOrgId,
    onSelectOrg: (orgId: number) => setSelectedId(fromModuleKey, orgId),
    onClearFilter: () => setOrgSearch(''),
    onLoadPage: (orgId: number, page: number) => {
      setMemberPage(page)
      void loadMembers(orgId, page)
    },
    memberRows: members,
  })

  // 组织树默认只展开根节点（进入页面不全量展开，避免树过长铺满；深层分支点击再展开）
  const rootKeys = useMemo<React.Key[]>(
    () => orgs.filter((o) => (o.parent_id ?? null) === null).map((o) => o.id),
    [orgs],
  )
  // 展开节点：搜索命中时展开到目标组织链；否则用上次手动展开的节点（跨路由保留）；再否则只展开根节点
  const expandedKeys = useMemo<React.Key[]>(
    () => search.focusKeys ?? storedExpandedKeys ?? rootKeys,
    [search.focusKeys, storedExpandedKeys, rootKeys],
  )
  // 解构出稳定引用（useCallback），避免把每次渲染都新建的 search 对象放进 effect 依赖
  const { consumePendingPage } = search

  // 切换组织后加载成员：默认回到第 1 页；若为搜索命中则按目标页加载
  useEffect(() => {
    if (activeOrgId === null) {
      setMembers([])
      setMemberTotal(0)
      return
    }
    const targetPage = consumePendingPage()
    setMemberPage(targetPage)
    void loadMembers(activeOrgId, targetPage)
  }, [activeOrgId, loadMembers, consumePendingPage])

  // parent_id -> children 建树；搜索关键词仅前端过滤名称/编码，并保留匹配节点的祖先链
  const treeData = useMemo<TreeProps['treeData']>(() => {
    const kw = orgSearch.trim().toLowerCase()
    const filtered = kw
      ? orgs.filter(
          (o) =>
            o.name.toLowerCase().includes(kw) ||
            (o.code ?? '').toLowerCase().includes(kw),
        )
      : orgs
    const visible = new Set<number>()
    for (const o of filtered) {
      let cur: OrgNode | undefined = o
      while (cur) {
        visible.add(cur.id)
        cur = cur.parent_id != null ? orgs.find((x) => x.id === cur!.parent_id) : undefined
      }
    }
    const byParent = new Map<number | null, OrgNode[]>()
    for (const o of orgs) {
      if (kw && !visible.has(o.id)) continue
      const key = o.parent_id ?? null
      const arr = byParent.get(key)
      if (arr) arr.push(o)
      else byParent.set(key, [o])
    }
    const build = (list?: OrgNode[]): NonNullable<TreeProps['treeData']> =>
      (list ?? []).map((o) => ({
        key: o.id,
        // 名称与编码相同时不重复展示编码，避免「XX（XX）」的冗余
        title: o.code && o.code !== o.name ? `${o.name}（${o.code}）` : o.name,
        children: build(byParent.get(o.id)),
      }))
    return build(byParent.get(null))
  }, [orgs, orgSearch])

  const selectedOrg = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) ?? null,
    [orgs, activeOrgId],
  )

  const memberIds = useMemo(() => members.map((m) => m.user_id), [members])
  // 姓名（真实姓名，GET /users/{id}）解析
  const memberNames = useUserNames(memberIds)
  // 职位编码 → 职位名称（成员接口只返回编码，展示时映射为名称，未命中回退编码）
  const positionNames = usePositionNames()

  /** 点击成员行 → 进入成员详情页（?from 用于侧栏高亮来源模块） */
  const openMember = useCallback(
    (uid: number) => {
      navigate(`/portal/${portalKey}/organization-members/${uid}?from=${fromModuleKey}`)
    },
    [navigate, portalKey, fromModuleKey],
  )

  const memberColumns = useMemo<ColumnsType<OrganizationMember>>(() => {
    const cols: ColumnsType<OrganizationMember> = [
      { title: t('memberDetail.fieldUid'), dataIndex: 'user_id', key: 'user_id', width: 90 },
      {
        title: t('profile.name'),
        key: 'user_name',
        width: 160,
        render: (_, record) =>
          memberNames.has(record.user_id)
            ? (memberNames.get(record.user_id) ?? '—')
            : t('common.loading'),
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
        width: 120,
        render: (_, record) => (
          <Tooltip title={t('memberDetail.viewDetailHint')}>
            <Button type="link" size="small" onClick={() => openMember(record.user_id)}>
              {t('memberDetail.detail')}
            </Button>
          </Tooltip>
        ),
      },
    ]
    return cols
  }, [t, memberNames, positionNames, openMember])

  return (
    <div className={`admin-org-view${showOrgTree && treeCollapsed ? ' is-tree-collapsed' : ''}`}>
      {showOrgTree && (
      <section className="panel-card org-tree-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('memberDetail.orgTreeTitle')}</h3>
          <Tooltip title={t('memberDetail.refreshOrgsHint')}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => onReloadOrgs(true)}
            />
          </Tooltip>
        </header>
        <div className="panel-card-body">
          {orgsError ? (
            <ErrorState message={orgsError} onRetry={() => onReloadOrgs(true)} />
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
                {!orgsLoading && orgs.length === 0 ? (
                  <Alert type="info" showIcon title={t('orgExplorer.emptyOrgs')} />
                ) : (
                  <Tree
                    key={(treeData?.length ?? 0) > 0 ? 'tree-loaded' : 'tree-empty'}
                    treeData={treeData}
                    expandedKeys={expandedKeys}
                    onExpand={(keys: React.Key[]) => {
                      search.setFocusKeys(keys)
                      setOrgTreeExpanded(fromModuleKey, keys.map((k) => Number(k)))
                    }}
                    selectedKeys={selectedId !== null ? [selectedId] : []}
                    onSelect={(keys: React.Key[]) =>
                      setSelectedId(fromModuleKey, keys.length ? Number(keys[0]) : null)
                    }
                    showLine
                    blockNode
                  />
                )}
              </Spin>
            </>
          )}
        </div>
      </section>
      )}

      <section className="panel-card org-members-card">
        <header className="panel-card-header">
          <div className="org-members-title">
            {/* 左侧组织树收起/展开（无组织树时不展示） */}
            {showOrgTree && (
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
                  onClick={() => setTreeCollapsed(fromModuleKey, !treeCollapsed)}
                />
              </Tooltip>
            )}
            <h3 className="panel-card-title">
              {selectedOrg
                ? selectedOrg.code && selectedOrg.code !== selectedOrg.name
                  ? `${selectedOrg.name}（${selectedOrg.code}）`
                  : selectedOrg.name
                : t('memberDetail.memberListTitle')}
            </h3>
          </div>
          <div className="org-members-actions">
            <PersonSearchBox
              width={300}
              value={search.query}
              onChange={search.setQuery}
              onSearch={search.run}
              loading={search.searching}
            />
            {selectedOrg && (
              <Tooltip title={t('memberDetail.refreshMembersHint')}>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => void loadMembers(selectedOrg.id, memberPage, true)}
                />
              </Tooltip>
            )}
          </div>
        </header>
        <div className="panel-card-body">
          {/* 组织树隐藏（showOrgTree=false）或已收起（treeCollapsed）时，组织加载错误不会在
              左侧树卡片中展示，需在成员卡片体兜底提示，避免报错被静默吞掉（代码要求 3） */}
          {orgsError && (!showOrgTree || treeCollapsed) ? (
            <ErrorState message={orgsError} onRetry={() => onReloadOrgs(true)} />
          ) : !orgsLoading && orgs.length === 0 ? (
            <Alert type="info" showIcon title={t('orgExplorer.emptyOrgs')} />
          ) : !selectedOrg ? (
            <Alert type="info" showIcon title={t('adminOrg.selectHint')} />
          ) : membersError ? (
            <ErrorState
              message={membersError}
              onRetry={() => void loadMembers(selectedOrg.id, memberPage, true)}
            />
          ) : (
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
              scroll={{ x: 860 }}
              onRow={(record: OrganizationMember) => ({
                onClick: (e: React.MouseEvent) => {
                  // 点击按钮/链接时不触发行点击
                  const target = e.target as HTMLElement
                  if (target.closest('button')) return
                  openMember(record.user_id)
                },
                title: t('memberDetail.rowClickHint'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: memberPage,
                pageSize: memberPageSize,
                total: memberTotal,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
                onChange: (p: number) => {
                  setMemberPage(p)
                  void loadMembers(selectedOrg.id, p)
                },
              }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
