/**
 * 党建活动加分审核（党委支部端 / 党委学院端共用页面）。
 *
 * 数据源：
 *   GET /api/approvals                     按显式 approver_id（当前登录用户）取审批步骤
 *   GET /api/party-scores                 按 approval_instance_id 精确反查，判定步骤是否属于加分业务
 *     （后端 GET /api/party-scores/approvals 只返回已处理步骤，不能用于待办列表）
 *   GET /api/users                         批量解析申请人真实姓名（useUserNames）
 *   PUT /api/party-scores/approvals/{id}/approve|reject|transfer  在审批详情页处理
 *
 * 点击行或操作列统一跳转到审批详情页（/portal/:portalKey/party-score-approvals/:stepId）：
 *   - 行点击：打开详情页查看审批内容；
 *   - 操作列「通过 / 驳回 / 转交」：打开详情页并自动选中对应操作，
 *     让审批内容与待填写表单在同一页面同屏展示；
 *   - 审批通过前必须填写「核定分数」，详情页已按后端最新契约设为必填并提交字符串分数。
 * 判定步骤归属时必须按实例精确查询，不能改成「拉全部加分申请再取交集」——
 * 后者会受调用者数据范围与分页影响，导致别人的申请被静默过滤掉。
 * 所有 GET 均走会话缓存，写操作后自动失效缓存并刷新表格。
 */
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Select, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { listSubsidiaries } from '../../api/organizations'
import { queryPartyScoreApprovals, queryPartyScores } from '../../api/partyScores'
import { queryUsers } from '../../api/users'
import type {
  ApprovalInstanceStep,
  ApprovalStepStatus,
} from '../../api/types/approvals'
import type { PartyScore } from '../../api/types/partyScores'
import ErrorState from '../../components/ErrorState'
import { resolvePortalOrg } from '../../composables/usePortalOrg'
import { ACADEMY_ANCESTOR_DEPTHS, BRANCH_ANCESTOR_DEPTHS } from '../../config/organization'
import {
  PARTY_SCORE_APPROVAL_PAGE_SIZE,
  PARTY_SCORE_APPROVAL_STATUS_COLOR,
} from '../../config/partyScoreApproval'
import { useUserNames } from '../../composables/useUserNames'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'
import { formatPartyScore, isNegativePartyScore } from '../../utils/partyScore'

/** 列表行：审批步骤 + 关联的加分申请（反查失败时为 null） */
interface ApprovalRow {
  step: ApprovalInstanceStep
  score: PartyScore | null
}

/**
 * 按审批实例 ID 批量反查加分申请。
 * @param instanceIds 审批实例 ID 数组（可为空；内部去重）
 * @param force 是否强制绕过缓存重新请求（用于手动刷新，默认 false）
 * @returns Promise<Map<number, PartyScore | null>> instance_id -> 加分申请（查不到或失败为 null）
 */
async function fetchPartyScoreMap(
  instanceIds: number[],
  force?: boolean,
): Promise<Map<number, PartyScore | null>> {
  const unique = [...new Set(instanceIds)]
  const entries = await Promise.all(
    unique.map(async (id) => {
      try {
        const res = await queryPartyScores(
          {
            approval_instance_id: id,
            page: 1,
            page_size: 1,
          },
          force,
        )
        return [id, res.data[0] ?? null] as const
      } catch {
        return [id, null] as const
      }
    }),
  )
  return new Map(entries)
}

/**
 * 党建活动加分审核页。
 * 党委支部端、党委学院端的「审核管理」共用本组件。
 */
export default function PartyScoreApprovalView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const navigate = useNavigate()
  const { portalKey, moduleKey } = useParams<{
    portalKey: string
    moduleKey: string
  }>()

  const [rows, setRows] = useState<ApprovalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  /** 状态多选筛选：空数组表示全部 */
  const [statusFilter, setStatusFilter] = useState<ApprovalStepStatus[]>([])
  /** 申请人筛选：null 表示全部 */
  const [applicantFilter, setApplicantFilter] = useState<number | null>(null)
  /** 组织筛选：null 表示全部 */
  const [organizationFilter, setOrganizationFilter] = useState<number | null>(null)
  /** 申请人搜索候选与加载态 */
  const [applicantOptions, setApplicantOptions] = useState<{ value: number; label: string }[]>([])
  const [searchingApplicants, setSearchingApplicants] = useState(false)
  /** 当前门户可筛选的下级组织（支部端/学院端） */
  const [organizationOptions, setOrganizationOptions] = useState<{ value: number; label: string }[]>([])

  /** 搜索申请人：按姓名或 UID 关键字返回候选，选中后按 user_id 精确筛选 */
  const searchApplicants = useCallback(async (raw: string) => {
    const keyword = raw.trim()
    setSearchingApplicants(true)
    try {
      if (!keyword) {
        setApplicantOptions([])
        return
      }
      const res = await queryUsers({ keyword, page: 1, page_size: 20 })
      setApplicantOptions(
        res.data.map((user) => ({
          value: user.uid,
          label: user.name ? `${user.name}（${user.uid}）` : String(user.uid),
        })),
      )
    } catch {
      setApplicantOptions([])
    } finally {
      setSearchingApplicants(false)
    }
  }, [])

  /** 加载支部端/学院端可直接筛选的下级组织 */
  useEffect(() => {
    if (portalKey !== 'branch' && portalKey !== 'academy') return
    let cancelled = false
    const depths = portalKey === 'branch' ? BRANCH_ANCESTOR_DEPTHS : ACADEMY_ANCESTOR_DEPTHS
    void resolvePortalOrg(depths)
      .then(({ orgId }) => (orgId === null ? Promise.resolve([]) : listSubsidiaries(orgId)))
      .then((children) => {
        if (cancelled) return
        setOrganizationOptions(
          children.map((org) => ({ value: org.id, label: org.name })),
        )
      })
      .catch(() => {
        if (!cancelled) setOrganizationOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [portalKey])

  /** 重置全部筛选条件 */
  const resetFilters = useCallback(() => {
    setPage(1)
    setStatusFilter([])
    setApplicantFilter(null)
    setOrganizationFilter(null)
  }, [])

  const load = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      try {
        // 先拿当前用户，再显式带 approver_id 查询：不依赖后端「缺省按本人待办」的隐式行为，
        // 也保证缓存键包含审批人，避免不同账号之间串用缓存
        const me = await getCurrentUser()
        const steps = await queryPartyScoreApprovals(
          {
            approver_id: me.uid,
            applicant_id: applicantFilter ?? undefined,
            organization_id: organizationFilter ?? undefined,
            page,
            page_size: PARTY_SCORE_APPROVAL_PAGE_SIZE,
          },
          force,
        )
        const scoreMap = await fetchPartyScoreMap(
          steps.map((step) => step.instance_id),
          force,
        )
        setRows(
          steps.map((step) => ({
            step,
            score: scoreMap.get(step.instance_id) ?? null,
          })),
        )
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          // 401 由全局拦截器处理，这里不重复提示
        } else {
          setError(extractErrorReason(err, t))
        }
      } finally {
        setLoading(false)
      }
    },
    [page, t, applicantFilter, organizationFilter],
  )

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 审批详情页地址。
   * @param stepId 审批步骤 ID（必填）
   * @returns 带来源模块参数的详情页地址；缺少门户信息时返回 null
   */
  const buildDetailPath = useCallback(
    (stepId: number): string | null => {
      if (!portalKey) return null
      const params = new URLSearchParams()
      if (moduleKey) params.set('from', moduleKey)
      const query = params.toString()
      return `/portal/${portalKey}/party-score-approvals/${stepId}${query ? `?${query}` : ''}`
    },
    [portalKey, moduleKey],
  )

  /** 打开审批详情页（整行点击） */
  const openDetail = useCallback(
    (row: ApprovalRow) => {
      const path = buildDetailPath(row.step.id)
      if (path) navigate(path)
    },
    [buildDetailPath, navigate],
  )

  const statusOptions = useMemo(
    () =>
      (['waiting', 'pending', 'approved', 'rejected', 'skipped'] as const).map((value) => ({
        value,
        label: t(`partyScoreApproval.status_${value}`),
      })),
    [t],
  )

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const statusOk = statusFilter.length === 0 || statusFilter.includes(row.step.status)
        const applicantOk = applicantFilter === null || row.score?.user_id === applicantFilter
        const organizationOk =
          organizationFilter === null || row.step.organization_id === organizationFilter
        return statusOk && applicantOk && organizationOk
      }),
    [rows, statusFilter, applicantFilter, organizationFilter],
  )

  const applicantIds = useMemo(
    () =>
      filteredRows
        .map((row) => row.score?.user_id)
        .filter((id): id is number => typeof id === 'number'),
    [filteredRows],
  )
  const userNames = useUserNames(applicantIds)

  const columns = useMemo<ColumnsType<ApprovalRow>>(
    () => [
      {
        title: t('partyScoreApproval.colAppId'),
        dataIndex: ['score', 'id'],
        key: 'appId',
        width: 90,
        render: (_, row) => row.score?.id ?? '—',
      },
      {
        title: t('partyScoreApproval.colApplicant'),
        dataIndex: ['score', 'user_id'],
        key: 'userId',
        width: 130,
        render: (_, row) => {
          if (!row.score) return '—'
          const name = userNames.get(row.score.user_id)
          // 姓名批量查询尚未返回时展示加载态；查询失败（如无 user.read 权限）回退用户 ID
          if (name === undefined) return t('common.loading')
          if (name) return name
          return (
            <Tooltip title={t('partyScoreApproval.applicantNameFallback')}>
              <span>{row.score.user_id}</span>
            </Tooltip>
          )
        },
      },
      {
        title: t('partyScoreApproval.colRequestedScore'),
        dataIndex: ['score', 'requested_score'],
        key: 'requestedScore',
        width: 110,
        align: 'center',
        render: (_, row) => {
          const score = row.score?.requested_score
          if (score === undefined) return '—'
          return (
            <span
              className={
                isNegativePartyScore(score) ? 'party-score-minus' : 'party-score-plus'
              }
            >
              {formatPartyScore(score)}
            </span>
          )
        },
      },
      {
        title: t('partyScoreApproval.colApprovedScore'),
        dataIndex: ['score', 'approved_score'],
        key: 'approvedScore',
        width: 110,
        align: 'center',
        render: (_, row) => formatPartyScore(row.score?.approved_score),
      },
      {
        title: t('partyScoreApproval.colStepOrder'),
        dataIndex: ['step', 'step_order'],
        key: 'stepOrder',
        width: 100,
        render: (n: number) => t('partyScoreApproval.stepOrderValue', { n: String(n) }),
      },
      {
        title: t('partyScoreApproval.colStatus'),
        dataIndex: ['step', 'status'],
        key: 'status',
        width: 110,
        filters: statusOptions.map(({ value, label }) => ({ text: label, value })),
        filteredValue: statusFilter,
        filterMultiple: true,
        onFilter: (value, row) => row.step.status === value,
        render: (status: ApprovalStepStatus) => (
          <Tag color={PARTY_SCORE_APPROVAL_STATUS_COLOR[status]}>
            {t(`partyScoreApproval.status_${status}`)}
          </Tag>
        ),
      },
      {
        title: t('partyScoreApproval.colStartedAt'),
        dataIndex: ['step', 'started_at'],
        key: 'startedAt',
        width: 170,
        render: (value: string) => formatDateTime(value, locale),
      },
      {
        title: t('partyScoreApproval.colFinishedAt'),
        dataIndex: ['step', 'finished_at'],
        key: 'finishedAt',
        width: 170,
        render: (value: string | null) => (value ? formatDateTime(value, locale) : '—'),
      },
      {
        title: t('partyScoreApproval.colAction'),
        key: 'action',
        width: 100,
        fixed: 'right',
        align: 'center',
        render: () => (
          <Tooltip title={t('partyScoreApproval.rowDoubleClickHint')}>
            <span className="approval-row-action-label">{t('partyScoreApproval.colAction')}</span>
          </Tooltip>
        ),
      },
    ],
    [t, locale, userNames, statusFilter, statusOptions],
  )

  // 审批步骤接口为裸数组，无 total：满页时预估可能还有下一页，用于展示分页与总页数
  const total =
    (page - 1) * PARTY_SCORE_APPROVAL_PAGE_SIZE +
    rows.length +
    (rows.length === PARTY_SCORE_APPROVAL_PAGE_SIZE ? 1 : 0)

  return (
    <div className="data-page-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyScoreApproval.title')}</h3>
          <div className="approval-toolbar" style={{ flexWrap: 'wrap' }}>
            <Select<ApprovalStepStatus[]>
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              style={{ width: 260 }}
              value={statusFilter}
              placeholder={t('partyScoreApproval.filterStatusPlaceholder')}
              options={statusOptions}
              onChange={(next) => {
                setPage(1)
                setStatusFilter(next)
              }}
            />
            <Select<number>
              showSearch
              allowClear
              filterOption={false}
              loading={searchingApplicants}
              style={{ width: 220 }}
              value={applicantFilter ?? undefined}
              placeholder={t('partyScoreApproval.filterApplicantPlaceholder')}
              options={applicantOptions}
              onSearch={(value) => void searchApplicants(value)}
              onChange={(next) => {
                setPage(1)
                setApplicantFilter(next ?? null)
              }}
              notFoundContent={
                searchingApplicants ? t('partyScoreApproval.searchingUsers') : null
              }
            />
            {organizationOptions.length > 0 && (
              <Select<number>
                allowClear
                style={{ width: 180 }}
                value={organizationFilter ?? undefined}
                placeholder={t('partyScoreApproval.filterOrganizationPlaceholder')}
                options={organizationOptions}
                onChange={(next) => {
                  setPage(1)
                  setOrganizationFilter(next ?? null)
                }}
              />
            )}
            <Button onClick={resetFilters}>{t('partyScoreApproval.filterReset')}</Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load(true)}>
              {t('common.refresh')}
            </Button>
          </div>
        </header>
        <div className="panel-card-body">
          {error ? (
            <ErrorState message={error} onRetry={() => void load(true)} />
          ) : (
            <Table<ApprovalRow>
              rowKey={(row) => row.step.id}
              loading={loading}
              columns={columns}
              dataSource={filteredRows}
              scroll={{ x: 1100 }}
              locale={{ emptyText: t('common.noData') }}
              rowClassName={(row) =>
                row.step.status === 'pending' ? 'party-score-approval-row-pending' : ''
              }
              onRow={(row) => ({
                onDoubleClick: () => openDetail(row),
                title: t('partyScoreApproval.rowDoubleClickHint'),
                style: { cursor: 'pointer' },
              })}
              /**
               * 表头状态筛选与工具栏多选共用 statusFilter：
               * 仅在筛选值变化时回到第 1 页，避免翻页时被重置。
               */
              onChange={(_, filters) => {
                const next = (filters.status ?? []) as ApprovalStepStatus[]
                const same =
                  next.length === statusFilter.length &&
                  next.every((status) => statusFilter.includes(status))
                if (!same) {
                  setPage(1)
                  setStatusFilter(next)
                }
              }}
              pagination={{
                current: page,
                pageSize: PARTY_SCORE_APPROVAL_PAGE_SIZE,
                total,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (n: number) =>
                  t('common.totalPages', {
                    n: Math.max(1, Math.ceil(n / PARTY_SCORE_APPROVAL_PAGE_SIZE)),
                  }),
                onChange: (nextPage: number) => setPage(nextPage),
              }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
