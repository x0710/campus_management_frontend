/**
 * 党员端「成绩申报」：申报表单 + 我的申报记录。
 *
 * 对接后端党建活动加分接口（/api/party-scores，见 api/partyScores.ts）：
 *   POST /api/party-scores                 提交加分申请（template_id + user_id + requested_score）
 *   GET  /api/party-scores?user_id=..       查询本人申报记录（分页；user_id 需显式传入，接口不会自动限定当前用户）
 * 「申报类型」取自审批模板 GET /api/approvals/templates（business_type='party'，见 config/partyDeclaration.ts）。
 *
 * 后端加分接口不提供申报时段 / 事由 / 佐证材料 / 撤回 / 删除，故页面不再展示这些字段与操作。
 * 按代码要求 4，接口细节只写在注释里，不进入页面文案。
 */
import { ReloadOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Select,
  Table,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { queryApprovalTemplates } from '../../api/approvalmodel'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { createPartyScore, queryPartyScores } from '../../api/partyScores'
import type { ApprovalTemplate } from '../../api/types/approvalmodel'
import type { PaginatedResponse } from '../../api/types/common'
import type { PartyScore } from '../../api/types/partyScores'
import ErrorState from '../../components/ErrorState'
import {
  PARTY_DECLARATION_PAGE_SIZE,
  PARTY_TEMPLATE_BUSINESS_TYPE,
} from '../../config/partyDeclaration'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/** 申报表单字段 */
interface DeclarationFormValues {
  /** 申报类型（审批模板 ID，提交为加分申请的 template_id） */
  template_id: number
  /** 申请加分（int64，正数加分、负数减分） */
  requested_score: number
}

/** 党员端：成绩申报（表单 + 本人申报记录） */
export default function PartyDeclarationView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const [form] = Form.useForm<DeclarationFormValues>()

  const [submitting, setSubmitting] = useState(false)
  /** 当前登录用户 ID（作为申报的 user_id；就绪前不拉取列表，避免取到他人数据） */
  const [myUid, setMyUid] = useState<number | null>(null)
  /** 点击记录行打开的申报详情（直接使用列表行数据展示，无需再次请求详情接口） */
  const [detail, setDetail] = useState<PartyScore | null>(null)
  /** 申报类型可选模板（审批模板，business_type='party'） */
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([])
  const [templatesError, setTemplatesError] = useState<string | null>(null)

  /** 加载成绩申报可用的审批模板；失败时在表单区展示错误与重试（代码要求 9） */
  const loadTemplates = useCallback(async () => {
    setTemplatesError(null)
    try {
      const res = await queryApprovalTemplates({
        business_type: PARTY_TEMPLATE_BUSINESS_TYPE,
        enabled: true,
        page: 1,
        page_size: PARTY_DECLARATION_PAGE_SIZE,
      })
      setTemplates(res.data)
    } catch (err) {
      setTemplatesError(extractErrorReason(err, t))
    }
  }, [t])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  /** 获取当前登录用户：提交时作为 user_id */
  useEffect(() => {
    let cancelled = false
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setMyUid(user.uid)
      })
      .catch((err) => {
        if (!cancelled) reportError(err)
      })
    return () => {
      cancelled = true
    }
  }, [reportError])

  /**
   * 我的申报记录：显式按 user_id 过滤（接口不会自动限定当前用户）。
   * user_id 就绪前返回空页占位，避免短暂展示到他人的申报数据。
   */
  const { data, total, loading, error, page, pageSize, setPage, setPageSize, reload, refresh } =
    usePaginated<PartyScore>(
      (query, force): Promise<PaginatedResponse<PartyScore>> => {
        if (myUid === null) {
          return Promise.resolve({
            data: [],
            total: 0,
            page: 1,
            page_size: query.page_size ?? PARTY_DECLARATION_PAGE_SIZE,
            total_pages: 0,
          })
        }
        return queryPartyScores({ ...query, user_id: myUid }, force)
      },
    )

  /** user_id 就绪后重新拉取本人申报记录 */
  useEffect(() => {
    if (myUid !== null) reload()
  }, [myUid, reload])

  /** 申报类型 ID → 名称，用于列表与详情展示（查不到时回退展示 ID，不编造名称） */
  const templateNameById = useMemo(
    () => new Map(templates.map((item) => [item.id, item.name])),
    [templates],
  )

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
        render: (id: number) => templateNameById.get(id) ?? id,
      },
      {
        title: t('partyDeclaration.colScore'),
        dataIndex: 'requested_score',
        key: 'requested_score',
        width: 120,
        align: 'center',
        // 正数加分（绿色）、负数减分（红色），与「我的成绩记录」保持同一配色
        render: (score: number) => (
          <span className={score < 0 ? 'party-score-minus' : 'party-score-plus'}>
            {score > 0 ? `+${score}` : score}
          </span>
        ),
      },
      {
        title: t('partyDeclaration.colApproved'),
        dataIndex: 'approved_score',
        key: 'approved_score',
        width: 120,
        align: 'center',
        render: (score: number | null) =>
          score === null || score === undefined ? (
            '—'
          ) : (
            <span className={score < 0 ? 'party-score-minus' : 'party-score-plus'}>
              {score > 0 ? `+${score}` : score}
            </span>
          ),
      },
      {
        title: t('partyDeclaration.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (v: string) => formatDateTime(v, locale),
      },
    ],
    [t, locale, templateNameById],
  )

  /** 提交加分申请：成功后重置表单并刷新本人申报记录（代码要求 13） */
  const onFinish = async (values: DeclarationFormValues) => {
    if (myUid === null) return
    setSubmitting(true)
    try {
      await createPartyScore({
        template_id: values.template_id,
        user_id: myUid,
        requested_score: values.requested_score,
      })
      message.success(t('partyDeclaration.createSuccess'))
      form.resetFields()
      if (page === 1) refresh()
      else setPage(1)
    } catch (err) {
      reportError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="party-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyDeclaration.formTitle')}</h3>
        </header>
        <div className="panel-card-body">
          {templatesError ? (
            <ErrorState message={templatesError} onRetry={() => void loadTemplates()} />
          ) : (
            <Form<DeclarationFormValues>
              form={form}
              layout="vertical"
              requiredMark={false}
              onFinish={onFinish}
              disabled={myUid === null}
            >
              <Form.Item
                name="template_id"
                label={t('partyDeclaration.fieldType')}
                rules={[{ required: true, message: t('partyDeclaration.typeRequired') }]}
              >
                <Select
                  style={{ maxWidth: 360 }}
                  placeholder={t('partyDeclaration.typeRequired')}
                  options={templates.map((item) => ({
                    value: item.id,
                    label: item.name,
                    title: item.description || item.name,
                  }))}
                />
              </Form.Item>

              <Form.Item
                name="requested_score"
                label={t('partyDeclaration.fieldScore')}
                rules={[{ required: true, message: t('partyDeclaration.scoreRequired') }]}
              >
                <InputNumber style={{ width: 180 }} precision={0} step={1} />
              </Form.Item>

              <Form.Item className="leave-submit-item">
                <Button type="primary" htmlType="submit" loading={submitting}>
                  {t('partyDeclaration.submit')}
                </Button>
              </Form.Item>
            </Form>
          )}
        </div>
      </section>

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyDeclaration.listTitle')}</h3>
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            {t('common.refresh')}
          </Button>
        </header>
        <div className="panel-card-body">
          {error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <Table<PartyScore>
              rowKey="id"
              loading={loading || myUid === null}
              columns={columns}
              dataSource={data}
              scroll={{ x: 760 }}
              onRow={(record) => ({
                onClick: () => setDetail(record),
                title: t('partyDeclaration.rowClickHint'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (n: number) =>
                  `${t('common.total')} ${n} ${t('common.items')} · ${t('common.totalPages', {
                    n: Math.max(1, Math.ceil(n / pageSize)),
                  })}`,
                onChange: (nextPage: number, nextSize: number) => {
                  if (nextSize !== pageSize) setPageSize(nextSize)
                  else setPage(nextPage)
                },
              }}
            />
          )}
        </div>
      </section>

      {/* 申报详情：点击记录行打开，仅展示加分申请字段（只读，无撤回/删除操作） */}
      <Modal
        open={detail !== null}
        title={t('partyDeclaration.detailTitle')}
        onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>{t('partyDeclaration.close')}</Button>}
      >
        {detail ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('partyDeclaration.colId')}>{detail.id}</Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.colDeclType')}>
              {templateNameById.get(detail.template_id) ?? detail.template_id}
            </Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.colScore')}>
              {detail.requested_score}
            </Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.colApproved')}>
              {detail.approved_score ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.detailInstance')}>
              {detail.approval_instance_id}
            </Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.colCreatedAt')}>
              {formatDateTime(detail.created_at, locale)}
            </Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.colUpdatedAt')}>
              {formatDateTime(detail.updated_at, locale)}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </div>
  )
}
