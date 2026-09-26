/**
 * 组织成员浏览器（可复用组件，代码要求 1）：
 * 左侧「组织树（可搜索）」+ 右侧「成员表（每页 20 行，支持翻页/跳页/总数）」，
 * 点击成员行或「详情」按钮跳转到成员详情页（成绩/请假/违规信息，代码要求 14）。
 *
 * 由领导端「组织概览」抽出，老师端「班级管理」复用同一套界面：
 * - 领导端传入全部组织（listAllOrganizations）；
 * - 老师端传入本人所在组织（listUserOrganizations），接口与数据范围都不变。
 *
 * 组织数据由父组件加载后传入（不同门户数据范围不同），本组件只负责组织树渲染、
 * 成员分页查询与跳转；成员查询走会话缓存，刷新传 force=true 绕过缓存（代码要求 5）。
 */
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Spin, Table, Tag, Tooltip, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { TreeProps } from 'antd/es/tree'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { extractErrorReason } from '../api/common'
import { queryOrgMembers } from '../api/organizations'
import type { OrganizationMember } from '../api/types/organizations'
import { useUserNames } from '../composables/useUserNames'
import { LEADER_ORG_MEMBER_PAGE_SIZE } from '../config/leaderOrg'
import { useT } from '../i18n'

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
  /** 成员表每页条数（可选，默认 LEADER_ORG_MEMBER_PAGE_SIZE = 20） */
  memberPageSize?: number
  /** 组织加载完成后是否自动选中第一个组织（可选，默认 false） */
  autoSelectFirst?: boolean
}

export default function OrgMembersExplorer({
  orgs,
  orgsLoading,
  orgsError,
  onReloadOrgs,
  fromModuleKey,
  memberPageSize = LEADER_ORG_MEMBER_PAGE_SIZE,
  autoSelectFirst = false,
}: OrgMembersExplorerProps) {
  const t = useT()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()

  const [orgSearch, setOrgSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
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

  // 自动选中首个组织（老师端通常只有一个组织，避免多一次点击）
  useEffect(() => {
    if (autoSelectFirst && selectedId === null && orgs.length > 0) {
      setSelectedId(orgs[0].id)
    }
  }, [autoSelectFirst, orgs, selectedId])

  // 切换组织后回到第 1 页并加载成员
  useEffect(() => {
    if (selectedId === null) {
      setMembers([])
      setMemberTotal(0)
      return
    }
    setMemberPage(1)
    void loadMembers(selectedId, 1)
  }, [selectedId, loadMembers])

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
    () => orgs.find((o) => o.id === selectedId) ?? null,
    [orgs, selectedId],
  )

  const memberNames = useUserNames(useMemo(() => members.map((m) => m.user_id), [members]))

  /** 点击成员行 → 进入成员详情页（?from 用于侧栏高亮来源模块） */
  const openMember = useCallback(
    (uid: number) => {
      navigate(`/portal/${portalKey}/organization-members/${uid}?from=${fromModuleKey}`)
    },
    [navigate, portalKey, fromModuleKey],
  )

  const memberColumns = useMemo<ColumnsType<OrganizationMember>>(
    () => [
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
        render: (v: string) => (
          <Tooltip title={v}>
            <Tag color="blue">{v}</Tag>
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
    ],
    [t, memberNames, openMember],
  )

  return (
    <div className="admin-org-view">
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
            <Alert
              type="error"
              showIcon
              title={orgsError}
              action={
                <Button size="small" onClick={() => onReloadOrgs(true)}>
                  {t('common.retry')}
                </Button>
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
                {!orgsLoading && orgs.length === 0 ? (
                  <Alert type="info" showIcon title={t('orgExplorer.emptyOrgs')} />
                ) : (
                  <Tree
                    treeData={treeData}
                    selectedKeys={selectedId !== null ? [selectedId] : []}
                    onSelect={(keys: React.Key[]) =>
                      setSelectedId(keys.length ? Number(keys[0]) : null)
                    }
                    showLine
                    blockNode
                    defaultExpandAll
                  />
                )}
              </Spin>
            </>
          )}
        </div>
      </section>

      <section className="panel-card org-members-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">
            {selectedOrg
              ? selectedOrg.code && selectedOrg.code !== selectedOrg.name
                ? `${selectedOrg.name}（${selectedOrg.code}）`
                : selectedOrg.name
              : t('memberDetail.memberListTitle')}
          </h3>
          {selectedOrg && (
            <Tooltip title={t('memberDetail.refreshMembersHint')}>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => void loadMembers(selectedOrg.id, memberPage, true)}
              />
            </Tooltip>
          )}
        </header>
        <div className="panel-card-body">
          {!selectedOrg ? (
            <Alert type="info" showIcon title={t('adminOrg.selectHint')} />
          ) : membersError ? (
            <Alert
              type="error"
              showIcon
              title={membersError}
              action={
                <Button
                  size="small"
                  onClick={() => void loadMembers(selectedOrg.id, memberPage, true)}
                >
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <Table<OrganizationMember>
              rowKey={(r: OrganizationMember, i: number | undefined) =>
                `${r.user_id}-${r.position}-${i ?? 0}`
              }
              loading={membersLoading}
              columns={memberColumns}
              dataSource={members}
              locale={{ emptyText: t('common.noData') }}
              scroll={{ x: 720 }}
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