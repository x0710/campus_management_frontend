/**
 * 领导端：组织概览（借鉴管理端组织架构的组织树 + 成员表，只读展示）。
 *
 * 数据来源：
 *   - 组织树：GET /api/organizations（分页循环取满，见 listAllOrganizations）
 *   - 成员表：GET /api/organizations/{id}/members（分页，每页 20 行）
 *   - 成员姓名：GET /api/users/{id}（useUserNames 批量解析，走会话缓存）
 *
 * 交互（ai 要求 14）：点击成员行跳转到「成员详情」页（成绩/请假/违规信息），
 * 携带 ?from=leader_m3 使侧栏仍高亮本模块。
 */
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Spin, Table, Tag, Tooltip, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { TreeProps } from 'antd/es/tree'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { extractErrorWithStatus } from '../../api/common'
import {
  listAllOrganizations,
  queryOrgMembers,
  type OrganizationInfo,
  type OrganizationMember,
} from '../../api/organizations'
import { useUserNames } from '../../composables/useUserNames'
import { LEADER_ORG_MEMBER_PAGE_SIZE } from '../../config/leaderOrg'
import { useT } from '../../i18n'

/** 领导端：组织概览（组织树 + 成员列表，点击成员进入详情页） */
export default function LeaderOrgView() {
  const t = useT()
  const navigate = useNavigate()
  const { portalKey } = useParams<{ portalKey: string }>()

  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)
  const [orgSearch, setOrgSearch] = useState('')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [memberPage, setMemberPage] = useState(1)
  const [memberTotal, setMemberTotal] = useState(0)

  /** 统一错误提示：带 HTTP 状态码（ai 要求 9） */
  const errorText = useCallback(
    (code: string) =>
      code === 'network'
        ? t('common.networkError')
        : code === 'failed'
          ? t('common.loadFailed')
          : code,
    [t],
  )

  const loadOrgs = useCallback(async (force?: boolean) => {
    setOrgsLoading(true)
    setOrgsError(null)
    try {
      setOrgs(await listAllOrganizations(force))
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setOrgsError(extractErrorWithStatus(err))
      }
    } finally {
      setOrgsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOrgs()
  }, [loadOrgs])

  const loadMembers = useCallback(async (orgId: number, page: number, force?: boolean) => {
    setMembersLoading(true)
    setMembersError(null)
    try {
      const res = await queryOrgMembers(
        orgId,
        { page, page_size: LEADER_ORG_MEMBER_PAGE_SIZE },
        force,
      )
      setMembers(res.data)
      setMemberTotal(res.total)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setMembersError(extractErrorWithStatus(err))
      }
    } finally {
      setMembersLoading(false)
    }
  }, [])

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
          (o) => o.name.toLowerCase().includes(kw) || o.code.toLowerCase().includes(kw),
        )
      : orgs
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
      const arr = byParent.get(o.parent_id)
      if (arr) arr.push(o)
      else byParent.set(o.parent_id, [o])
    }
    const build = (list?: OrganizationInfo[]): NonNullable<TreeProps['treeData']> =>
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

  /** 点击成员行 → 进入成员详情页（保留来源模块用于侧栏高亮） */
  const openMember = useCallback(
    (uid: number) => {
      navigate(`/portal/${portalKey}/organization-members/${uid}?from=leader_m3`)
    },
    [navigate, portalKey],
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
              onClick={() => void loadOrgs(true)}
            />
          </Tooltip>
        </header>
        <div className="panel-card-body">
          {orgsError ? (
            <Alert
              type="error"
              showIcon
              title={errorText(orgsError)}
              action={
                <Button size="small" onClick={() => void loadOrgs(true)}>
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <>
              <InputSearch
                value={orgSearch}
                onChange={setOrgSearch}
                placeholder={t('adminOrg.searchPlaceholder')}
              />
              <Spin spinning={orgsLoading}>
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
              title={errorText(membersError)}
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
                pageSize: LEADER_ORG_MEMBER_PAGE_SIZE,
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

/** 组织树搜索框（内联小组件，避免为单一用途抽出公共组件） */
function InputSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <Input.Search
      allowClear
      size="small"
      style={{ marginBottom: 8 }}
      prefix={<SearchOutlined />}
      placeholder={placeholder}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  )
}
