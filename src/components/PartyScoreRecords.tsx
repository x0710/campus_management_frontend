/**
 * 党员端：我的成绩记录表格（真实党建加分申请数据）。
 *
 * 数据来自当前用户 GET /api/party-scores（见 useMyPartyScores），
 * 展示申报编号 / 申报类型 / 申请加分 / 核定分数 / 创建时间，点击行打开详情弹窗。
 */
import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { queryApprovalTemplates } from '../api/approvalmodel'
import type { PartyScore } from '../api/types/partyScores'
import { useMyPartyScores } from '../composables/useMyPartyScores'
import {
  PARTY_DECLARATION_PAGE_SIZE,
  PARTY_TEMPLATE_BUSINESS_TYPE,
} from '../config/partyDeclaration'
import { useT } from '../i18n'
import { useSettingsStore } from '../store/settings'
import { formatDateTime } from '../utils/datetime'
import { formatPartyScore, isNegativePartyScore } from '../utils/partyScore'
import ErrorState from './ErrorState'
import PartyScoreDetailModal from './PartyScoreDetailModal'

export default function PartyScoreRecords() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { records, loading, error, refresh } = useMyPartyScores()
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
          row.template_id !== undefined
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
        render: (score: string | null) => (
          <span className={isNegativePartyScore(score) ? 'party-score-minus' : 'party-score-plus'}>
            {formatPartyScore(score)}
          </span>
        ),
      },
      {
        title: t('partyDeclaration.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (value: string) => formatDateTime(value, locale),
      },
    ],
    [t, locale, templateNames],
  )

  if (error) {
    return <ErrorState message={error} onRetry={() => refresh(true)} />
  }

  return (
    <>
      <Table<PartyScore>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={records}
        scroll={{ x: 760 }}
        onRow={(record) => ({
          onClick: () => setDetail(record),
          title: t('partyDeclaration.rowClickHint'),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (n: number) =>
            `${t('common.total')} ${n} ${t('common.items')} · ${t('common.totalPages', {
              n: Math.max(1, Math.ceil(n / 20)),
            })}`,
        }}
      />
      <PartyScoreDetailModal
        record={detail}
        templateNames={templateNames}
        onClose={() => setDetail(null)}
      />
    </>
  )
}
