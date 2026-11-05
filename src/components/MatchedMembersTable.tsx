import OrganizationName from './OrganizationName'
import { isEntryActionTarget } from '../utils/entryInteraction'
/**
 * 「单独查看匹配人员」表格（可复用组件，代码要求 1）。
 *
 * 组织成员按姓名搜索后，可切换到「只看匹配出来的人员」：
 * 用本组件替代组织成员表，一行一个匹配到的用户，不随组织树切换。
 * 展示 UID / 姓名 / 所属组织 / 职位 / 工作地点，双击行或「查看详细」进入成员详情。
 *
 * 数据来源：
 *   - rows 来自 useMemberSearch 的 matches（已按当前展示组织范围过滤，顺序与结果条一致）；
 *   - 姓名缺失时用 useUserNames 兜底，职位 / 工作地点由 useUserOrganizations 批量解析
 *     （均走会话缓存，仅对当前页行发起请求）；
 *   - 分页在前端完成（每页最多 100 行，代码要求 12）；
 *   - 命中行按 hitUid 高亮，并自动翻到所在页、滚动到可视区中部。
 */
import { Button, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import type { MemberSearchHit } from '../composables/useMemberSearch'
import { usePositionLabel } from '../composables/usePositionLabel'
import { useUserNames } from '../composables/useUserNames'
import { useUserOrganizations } from '../composables/useUserOrganizations'
import { MEMBER_TABLE_PAGE_SIZE } from '../config/organization'
import { useT } from '../i18n'
import type { UserOrganization } from '../api/types/organizations'
import { uniquePositionCodes, uniqueWorkplaces } from '../utils/userOrganization'

interface MatchedMembersTableProps {
  /** 匹配人员列表（必填；已按当前组织范围过滤） */
  rows: MemberSearchHit[]
  /** 当前高亮的用户 UID（必填；null 表示无高亮） */
  hitUid: number | null
  /** 是否正在加载匹配人员（必填） */
  loading: boolean
  /** 点击查看成员详情（必填） */
  onOpenMember: (uid: number) => void
  /** 每页行数（可选，默认 100；代码要求 12：表格每页最多 100 行） */
  pageSize?: number
}

/**
 * 取出用户在命中组织下的全部任职记录。
 * 同一组织可能有多个职位记录（一条记录 = 一个职位），展示职位 / 工作地点时需聚合。
 *
 * @param list 该用户的全部任职组织（必填，可能为空）
 * @param orgId 命中组织 ID（必填）
 * @returns 命中组织下的任职记录数组；没有则空数组
 */
function pickMemberships(
  list: UserOrganization[] | undefined,
  orgId: number,
): UserOrganization[] {
  return (list ?? []).filter((o) => o.organization_id === orgId)
}

export default function MatchedMembersTable({
  rows,
  hitUid,
  loading,
  onOpenMember,
  pageSize = MEMBER_TABLE_PAGE_SIZE,
}: MatchedMembersTableProps) {
  const t = useT()

  /**
   * 当前页码 = 用户手动翻到的页；命中项变化时自动切到其所在页（纯派生，不用 effect 改 state）。
   * key 记录页码对应的命中 UID：命中变化后按新的命中位置重新推导，用户手动翻页后保持所选页。
   */
  const [pageState, setPageState] = useState<{ key: number | null; page: number }>({
    key: null,
    page: 1,
  })
  const maxPage = Math.max(1, Math.ceil(rows.length / pageSize))
  const hitIndex = hitUid === null ? -1 : rows.findIndex((r) => r.uid === hitUid)
  const hitPage = hitIndex >= 0 ? Math.floor(hitIndex / pageSize) + 1 : 1
  const page = Math.min(
    pageState.key === hitUid ? pageState.page : hitPage,
    maxPage,
  )
  const pageRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  )
  const pageUids = useMemo(() => pageRows.map((r) => r.uid), [pageRows])
  const names = useUserNames(pageUids)
  const userOrgs = useUserOrganizations(pageUids)
  const positionLabel = usePositionLabel()

  // 命中行随页渲染出来后滚动到可视区中部（命中项可能位于长列表深处）
  useEffect(() => {
    if (hitUid === null || hitIndex < 0) return
    const raf = requestAnimationFrame(() => {
      document
        .querySelector('.org-member-row-hit')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [hitUid, hitIndex, page])

  const columns = useMemo<ColumnsType<MemberSearchHit>>(() => {
    /** 姓名：搜索结果已带回姓名，缺失时用批量解析结果兜底 */
    const nameOf = (row: MemberSearchHit): string => {
      if (row.name) return row.name
      if (names.has(row.uid)) return names.get(row.uid) || '—'
      return t('common.loading')
    }
    /** 命中组织上的全部任职记录（同一组织多个职位时全部取出） */
    const membershipsOf = (row: MemberSearchHit): UserOrganization[] =>
      pickMemberships(userOrgs.get(row.uid), row.targetId)
    /** 职位名称：未解析完成时展示 loading；同一组织多个职位并列展示，映射失败回退编码 */
    const positionOf = (row: MemberSearchHit): ReactNode => {
      if (!userOrgs.has(row.uid)) return <span className="cell-sub">{t('common.loading')}</span>
      const codes = uniquePositionCodes(membershipsOf(row))
      if (codes.length === 0) return '—'
      return (
        <Space wrap size={[8, 4]}>
          {codes.map((code) => (
            <Tooltip key={code} title={positionLabel(code)}>
              <Tag color="blue">{positionLabel(code)}</Tag>
            </Tooltip>
          ))}
        </Space>
      )
    }
    /** 工作地点：未解析完成时展示 loading；多个职位的工作地点去重合并 */
    const workplaceOf = (row: MemberSearchHit): ReactNode => {
      if (!userOrgs.has(row.uid)) return <span className="cell-sub">{t('common.loading')}</span>
      const places = uniqueWorkplaces(membershipsOf(row))
      return places.length > 0 ? places.join('、') : '—'
    }

    return [
      {
        title: 'UID',
        dataIndex: 'uid',
        key: 'uid',
        width: 90,
      },
      {
        title: t('profile.name'),
        key: 'name',
        width: 140,
        render: (_, row) => nameOf(row),
      },
      {
        title: t('adminOrg.colUserOrg'),
        key: 'org',
        width: 200,
        render: (_, row) => (
          <Tag color="blue" title={row.orgName}>
            <OrganizationName id={row.targetId} fallbackName={row.orgName} />
          </Tag>
        ),
      },
      {
        title: t('adminOrg.colPosition'),
        key: 'position',
        width: 160,
        render: (_, row) => positionOf(row),
      },
      {
        title: t('adminOrg.colWorkplace'),
        key: 'workplace',
        width: 160,
        render: (_, row) => workplaceOf(row),
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 120,
        render: (_, row) => (
          <Tooltip title={t('memberDetail.viewDetailHint')}>
            <Button type="link" size="small" onClick={() => onOpenMember(row.uid)}>
              {t('memberDetail.detail')}
            </Button>
          </Tooltip>
        ),
      },
    ]
  }, [t, names, userOrgs, positionLabel, onOpenMember])

  return (
    <Table<MemberSearchHit>
      rowKey="uid"
      loading={loading}
      columns={columns}
      dataSource={pageRows}
      rowClassName={(row) => (row.uid === hitUid ? 'org-member-row-hit' : '')}
      locale={{ emptyText: t('common.noData') }}
      scroll={{ x: 900 }}
      onRow={(row) => ({
        onDoubleClick: (e: MouseEvent) => {
          if (isEntryActionTarget(e.target)) return
          // 点击按钮时不触发行点击
          const target = e.target as HTMLElement
          if (target.closest('button')) return
          onOpenMember(row.uid)
        },
        title: t('memberDetail.rowClickHint'),
        style: { cursor: 'pointer' },
      })}
      pagination={{
        current: page,
        pageSize,
        total: rows.length,
        showSizeChanger: false,
        showQuickJumper: true,
        showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
        onChange: (p: number) => setPageState({ key: hitUid, page: p }),
      }}
    />
  )
}
