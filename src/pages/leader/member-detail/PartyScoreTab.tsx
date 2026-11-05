import { useRequestSequence } from '../../../composables/useRequestSequence'
import PartyScoreDeductionButton from '../../../components/PartyScoreDeductionButton'
import PartyScoreDeductionInfo from '../../../components/PartyScoreDeductionInfo'
import { isPartyScoreDeduction } from '../../../utils/partyScore'
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Descriptions, Modal, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractErrorReason } from '../../../api/common'
import {
  getPartyScore,
  getPartyScoreTotals,
  hydratePartyScoreRows,
  queryPartyScores,
} from '../../../api/partyScores'
import type { PartyScore, PartyScoreDetail } from '../../../api/types/partyScores'
import PartyScoreApprovalRecords from '../../../components/PartyScoreApprovalRecords'
import { useErrorFeedback } from '../../../composables/useErrorFeedback'
import { MEMBER_DETAIL_PAGE_SIZE } from '../../../config/leaderOrg'
import { PARTY_SCORE_BASE } from '../../../config/partyDeclaration'
import { type TranslateFn } from '../../../i18n'
import { formatDateTime } from '../../../utils/datetime'
import { formatPartyScore, isNegativePartyScore } from '../../../utils/partyScore'
import ErrorState from '../../../components/ErrorState'

const { Text } = Typography

/**
 * 「获得加分总数」Tab（支部端 / 学院端 / 学校端成员详情专用）：
 * 顶部展示「基础分 70 + 党建活动加分 = 获得加分总数」；
 * 下方分页列出该成员的全部加分申请（GET /api/party-scores?user_id=成员），
 * 点击行通过 GET /api/party-scores/{id} 查看详情（含附件下载地址，代码要求 14）。
 */
export default function PartyScoreTab({
  uid,
  t,
  locale,
}: {
  uid: number
  t: TranslateFn
  locale: 'zh' | 'en'
}) {
  const reportError = useErrorFeedback()

  const [records, setRecords] = useState<PartyScore[]>([])
  const [total, setTotal] = useState(0)
  const [bonusText, setBonusText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState({ seq: 0, force: false })

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<PartyScoreDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const requests = useRequestSequence()
  const load = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    try {
      // 该成员的全部加分申请（分页最多 100 行，代码要求 12）
      const res = await queryPartyScores(
        { user_id: uid, page, page_size: MEMBER_DETAIL_PAGE_SIZE },
        reload.force,
      )
      // 列表摘要可能缺 template_id / created_at / updated_at，详情接口才返回完整字段；
      // 这里补齐后再交给表格展示，确保创建时间与更新时间可见。
      if (!isCurrent()) return
      const records = await hydratePartyScoreRows(res.data, reload.force)
      if (!isCurrent()) return
      setRecords(records)
      setTotal(res.total)
      try {
        // 加分总计接口失败时退回「本页已核定分数之和」，保证总数区域仍可展示
        const totals = await getPartyScoreTotals([uid], reload.force)
        if (!isCurrent()) return
        const hit = totals.find(([id]) => id === uid)
        setBonusText(hit ? hit[1] : '0')
      } catch (err) {
        if (!isCurrent()) return
        const sum = res.data.reduce((acc, record) => {
          const value = Number(record.approved_score)
          return Number.isFinite(value) ? acc + value : acc
        }, 0)
        setBonusText(String(sum))
        if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
          reportError(err)
        }
      }
    } catch (err) {
      if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [uid, page, reload.force, t, reportError, requests])

  useEffect(() => {
    void load()
    return () => requests.invalidate()
  }, [load, requests, reload.seq])

  /** 获得加分总数 = 基础分 70 + 党建活动加分合计 */
  const totalText = useMemo(() => {
    if (bonusText === null) return '—'
    const bonus = Number(bonusText)
    return Number.isFinite(bonus) ? String(PARTY_SCORE_BASE + bonus) : '—'
  }, [bonusText])

  const openDetail = useCallback(
    async (record: PartyScore) => {
      setDetailOpen(true)
      setDetail(null)
      setDetailLoading(true)
      try {
        setDetail(await getPartyScore(record.id, true))
      } catch (err) {
        reportError(err)
        setDetailOpen(false)
      } finally {
        setDetailLoading(false)
      }
    },
    [reportError],
  )

  const columns = useMemo<ColumnsType<PartyScore>>(
    () => [
      {
        title: t('memberDetail.partyScoreColId'),
        dataIndex: 'id',
        key: 'id',
        width: 100,
      },
      {
        title: t('partyDeclaration.colDeclType'),
        key: 'record_type',
        width: 120,
        render: (_, row) => <Tag color={isPartyScoreDeduction(row) ? 'error' : 'success'}>
          {t(isPartyScoreDeduction(row) ? 'partyDeduction.type' : 'partyDeduction.bonusType')}
        </Tag>,
      },
      {
        title: t('memberDetail.partyScoreColRequested'),
        dataIndex: 'requested_score',
        key: 'requested_score',
        width: 110,
        align: 'center',
        render: (v: string) => (
          <span style={{ fontWeight: 600, color: isNegativePartyScore(v) ? '#cf1322' : '#389e0d' }}>
            {formatPartyScore(v)}
          </span>
        ),
      },
      {
        title: t('memberDetail.partyScoreColApproved'),
        dataIndex: 'approved_score',
        key: 'approved_score',
        width: 110,
        align: 'center',
        render: (v: string | null) => (
          <span style={{ fontWeight: 600, color: isNegativePartyScore(v) ? '#cf1322' : '#389e0d' }}>
            {formatPartyScore(v)}
          </span>
        ),
      },
      {
        title: t('memberDetail.partyScoreColInstance'),
        dataIndex: 'approval_instance_id',
        key: 'approval_instance_id',
        width: 110,
      },
      {
        title: t('memberDetail.partyScoreColCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 170,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('memberDetail.partyScoreColUpdatedAt'),
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 170,
        render: (v: string) => formatDateTime(v, locale),
      },
    ],
    [t, locale],
  )

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
        <PartyScoreDeductionButton key={uid} userId={uid} onSaved={() => {
          setPage(1)
          setReload((r) => ({ seq: r.seq + 1, force: true }))
        }} />
        <Tooltip title={t('memberDetail.partyScoreRefreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      <Descriptions
        bordered
        size="small"
        column={3}
        style={{ marginBottom: 12 }}
        items={[
          {
            key: 'base',
            label: t('memberDetail.partyScoreBaseScore'),
            children: PARTY_SCORE_BASE,
          },
          {
            key: 'bonus',
            label: t('partyDeduction.netScore'),
            children: bonusText === null ? '—' : formatPartyScore(bonusText),
          },
          {
            key: 'total',
            label: t('memberDetail.partyScoreTotalLabel'),
            children: <Text strong>{totalText}</Text>,
          },
        ]}
      />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
        />
      ) : (
        <Table<PartyScore>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={records}
          locale={{ emptyText: t('memberDetail.partyScoreEmpty') }}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: () => void openDetail(record),
            title: t('memberDetail.partyScoreRowClickHint'),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize: MEMBER_DETAIL_PAGE_SIZE,
            total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      <Modal
        open={detailOpen}
        title={t('memberDetail.partyScoreDetailTitle')}
        footer={null}
        onCancel={() => setDetailOpen(false)}
        destroyOnHidden
      >
        <Spin spinning={detailLoading}>
          {detail && (
            <>
              <Descriptions
                bordered
                size="small"
                column={1}
                items={[
                  {
                    key: 'id',
                    label: t('memberDetail.partyScoreColId'),
                    children: detail.id,
                  },
                  {
                    key: 'template',
                    label: t('memberDetail.partyScoreTemplate'),
                    children: isPartyScoreDeduction(detail) ? t('partyDeduction.type') : detail.template_id,
                  },
                  {
                    key: 'requested',
                    label: t('memberDetail.partyScoreColRequested'),
                    children: formatPartyScore(detail.requested_score),
                  },
                  {
                    key: 'approved',
                    label: t('memberDetail.partyScoreColApproved'),
                    children: formatPartyScore(detail.approved_score),
                  },
                  {
                    key: 'reason',
                    label: t('memberDetail.partyScoreReason'),
                    children: detail.reason?.trim() ? detail.reason : '—',
                  },
                  {
                    key: 'instance',
                    label: t('memberDetail.partyScoreColInstance'),
                    children: detail.approval_instance_id ?? '—',
                  },
                  {
                    key: 'created',
                    label: t('memberDetail.partyScoreColCreatedAt'),
                    children: formatDateTime(detail.created_at, locale),
                  },
                  {
                    key: 'updated',
                    label: t('memberDetail.partyScoreColUpdatedAt'),
                    children: formatDateTime(detail.updated_at, locale),
                  },
                  {
                    key: 'files',
                    label: t('memberDetail.partyScoreFiles'),
                    children: (detail.file_urls ?? []).length ? (
                      <Space orientation="vertical" size={4}>
                        {(detail.file_urls ?? []).map((url, idx) => (
                          <a key={`${url}-${idx}`} href={url} target="_blank" rel="noreferrer">
                            {t('memberDetail.partyScoreFileItem', { n: idx + 1 })}
                          </a>
                        ))}
                      </Space>
                    ) : (
                      t('memberDetail.partyScoreNoFiles')
                    ),
                  },
                ]}
              />
              {isPartyScoreDeduction(detail) ? <PartyScoreDeductionInfo record={detail} /> : <section className="party-approval-section" style={{ marginTop: 16 }}>
                <h4 className="party-approval-section-title">
                  {t('memberDetail.partyScoreApprovalFlow')}
                </h4>
                <PartyScoreApprovalRecords instanceId={detail.approval_instance_id} force />
              </section>}
            </>
          )}
        </Spin>
      </Modal>
    </>
  )
}
