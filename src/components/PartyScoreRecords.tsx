import CreatedDateFilter from './CreatedDateFilter'
import type { CreatedDateQuery } from '../api/types/common'
import { isEntryActionTarget } from '../utils/entryInteraction'
/**
 * 党员端：我的成绩记录表格（真实党建加分申请数据）。
 *
 * 数据来自当前用户 GET /api/party-scores（见 useMyPartyScores），
 * 展示申报编号 / 申报类型 / 申请加分 / 核定分数 / 创建时间，双击行打开详情弹窗。
 */
import { isPartyScoreDeduction } from '../utils/partyScore'
import { Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { queryApprovalTemplates } from '../api/approvalmodel'
import type { PartyScore } from '../api/types/partyScores'
import { useMyPartyScores } from '../composables/useMyPartyScores'
import { usePartyScoreApplicationStatuses } from '../composables/usePartyScoreApplicationStatuses'
import {
  PARTY_DECLARATION_PAGE_SIZE,
  PARTY_SCORE_APPLICATION_STATUS_COLOR,
  PARTY_TEMPLATE_BUSINESS_TYPE,
} from '../config/partyDeclaration'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import { formatPartyScore, isNegativePartyScore } from '../utils/partyScore'
import ErrorState from './ErrorState'
import PartyScoreDetailModal from './PartyScoreDetailModal'

/** PartyScoreRecords 组件。
 * @returns 类型：Element
 */
export default function PartyScoreRecords() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const [createdDates, setCreatedDates] = useState<CreatedDateQuery>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const { records, loading, error, refresh } = useMyPartyScores(createdDates)
  // 审核状态：核定分数只有在审批全部通过后才有效，驳回 / 审核中不能显示为 0 分
  const { statuses } = usePartyScoreApplicationStatuses(records)
  const [templateNames, setTemplateNames] = useState<Map<number, string>>(new Map())
  const [detail, setDetail] = useState<PartyScore | null>(null)

  useEffect(() => {
    let cancelled = false
    queryApprovalTemplates({
      business_type: PARTY_TEMPLATE_BUSINESS_TYPE,
      enabled: true,
      page: 1,
      page_size: PARTY_DECLARATION_PAGE_SIZE,
    })
      .then((res) => {
        if (!cancelled) {
          setTemplateNames(new Map(res.data.map((item) => [item.id, item.name])))
        }
      })
      .catch(() => {
        // 模板名称取不到时回退展示模板 ID，不影响成绩记录表格
      })
    return () => {
      cancelled = true
    }
  }, [])

  const columns = useMemo<ColumnsType<PartyScore>>(
    () => [
      {
        title: t('partyDeclaration.colId'),
        dataIndex: 'id',
        key: 'id',
        width: 110,
      },
      {
        title: t('partyDeclaration.colDeclType'),
        dataIndex: 'template_id',
        key: 'template_id',
        width: 200,
        render: (_, row) =>
          isPartyScoreDeduction(row) ? t('partyDeduction.type') : row.template_id != null
            ? templateNames.get(row.template_id) ?? row.template_id
            : t('common.unknown'),
      },
      {
        title: t('partyDeclaration.colScore'),
        dataIndex: 'requested_score',
        key: 'requested_score',
        width: 120,
        align: 'center',
        render: (score: string) => (
          <span className={isNegativePartyScore(score) ? 'party-score-minus' : 'party-score-plus'}>
            {formatPartyScore(score)}
          </span>
        ),
      },
      {
        title: t('partyDeclaration.colApproved'),
        dataIndex: 'approved_score',
        key: 'approved_score',
        width: 120,
        align: 'center',
        // 只有审批通过（或直接扣分已生效）才展示分数；驳回/审核中统一展示「-」，
        // 避免后端返回 0 时被误认为已核定 0 分
        render: (score: string | null, row) => {
          const effective =
            isPartyScoreDeduction(row) || statuses.get(row.id) === 'approved'
          if (!effective) return '-'
          return (
            <span className={isNegativePartyScore(score) ? 'party-score-minus' : 'party-score-plus'}>
              {formatPartyScore(score)}
            </span>
          )
        },
      },
      {
        // 审核进度：审核中 / 审核通过 / 被驳回（直接扣分展示扣分成功）
        title: t('partyDeclaration.colReviewStatus'),
        key: 'review_status',
        width: 120,
        align: 'center',
        render: (_, record) => {
          if (isPartyScoreDeduction(record)) {
            return <Tag color="error">{t('partyDeduction.success')}</Tag>
          }
          const status = statuses.get(record.id)
          if (!status) return <Spin size="small" />
          return (
            <Tag color={PARTY_SCORE_APPLICATION_STATUS_COLOR[status]}>
              {t(`partyDeclaration.applicationStatus_${status}`)}
            </Tag>
          )
        },
      },
      {
        title: t('partyDeclaration.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (value: string) => formatDateTime(value, locale),
      },
    ],
    [t, locale, templateNames, statuses],
  )

  return (
    <>
      <div style={{ marginBottom: 12 }}><CreatedDateFilter value={createdDates} onChange={(next) => { setPage(1); setCreatedDates(next) }} /></div>
      {error ? <ErrorState message={error} onRetry={() => refresh(true)} /> : <Table<PartyScore>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={records}
        scroll={{ x: 880 }}
        onRow={(record) => ({
          onDoubleClick: (event) => {
            if (isEntryActionTarget(event.target)) return
            setDetail(record)
          },
          title: t('partyDeclaration.rowClickHint'),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: page,
          pageSize,
          onChange: (next, size) => { setPage(size !== pageSize ? 1 : next); setPageSize(size) },
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (n: number) =>
            `${t('common.total')} ${n} ${t('common.items')} · ${t('common.totalPages', {
              n: Math.max(1, Math.ceil(n / pageSize)),
            })}`,
        }}
      />}
      <PartyScoreDetailModal
        record={detail}
        templateNames={templateNames}
        onClose={() => setDetail(null)}
      />
    </>
  )
}
