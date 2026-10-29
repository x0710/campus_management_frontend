/**
 * 党员端「成绩申报」：申报表单 + 我的申报记录。
 *
 * 对接后端党建活动加分接口（/api/party-scores，见 api/partyScores.ts）：
 *   POST /api/files          上传凭证附件，返回文件 ID
 *   POST /api/party-scores   提交加分申请（template_id + requested_score + files 附件 ID 列表；申请人由后端按登录身份确定）
 *   GET  /api/party-scores/{id}             查询加分申请详情（含 file_urls 附件下载地址）
 *   GET  /api/party-scores?user_id=..       查询本人申报记录（分页；user_id 需显式传入，接口不会自动限定当前用户）
 * 「申报类型」取自审批模板 GET /api/approvals/templates（business_type='party'，见 config/partyDeclaration.ts）。
 *
 * 附件：先上传文件拿 ID，再随创建请求的 files 字段提交，实现申请与附件匹配；
 * 后端加分接口不提供申报时段 / 事由 / 撤回 / 删除，故页面不展示这些字段与操作。
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
import { createPartyScore, getPartyScore, queryPartyScores } from '../../api/partyScores'
import type { ApprovalTemplate } from '../../api/types/approvalmodel'
import type { PaginatedResponse } from '../../api/types/common'
import type { PartyScore } from '../../api/types/partyScores'
import AttachmentLinks from '../../components/AttachmentLinks'
import AttachmentUploader from '../../components/AttachmentUploader'
import ErrorState from '../../components/ErrorState'
import {
  PARTY_DECLARATION_MAX_FILES,
  PARTY_DECLARATION_PAGE_SIZE,
  PARTY_TEMPLATE_BUSINESS_TYPE,
} from '../../config/partyDeclaration'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'
import { formatPartyScore, isNegativePartyScore } from '../../utils/partyScore'

/** 申报表单字段 */
interface DeclarationFormValues {
  /** 申报类型（审批模板 ID，提交为加分申请的 template_id） */
  template_id: number
  /** 申请加分（DecimalText 字符串，正数加分、负数减分） */
  requested_score: string
  /** 附件文件 ID 列表（由 AttachmentUploader 上传 /api/files 后回填） */
  files?: number[]
}

/** 党员端：成绩申报（表单 + 本人申报记录） */
export default function PartyDeclarationView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const [form] = Form.useForm<DeclarationFormValues>()

  const [submitting, setSubmitting] = useState(false)
  /** 当前登录用户 ID（用于按 user_id 过滤本人记录；就绪前不拉取列表，避免取到他人数据） */
  const [myUid, setMyUid] = useState<number | null>(null)
  /** 点击记录行打开的申报详情（先展示列表行数据，再用详情接口补充附件地址） */
  const [detail, setDetail] = useState<PartyScore | null>(null)
  /** 详情接口加载状态（附件下载地址 file_urls 来自详情接口） */
  const [detailLoading, setDetailLoading] = useState(false)
  /** 详情接口错误文案（含状态码） */
  const [detailError, setDetailError] = useState<string | null>(null)
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
        render: (score: string | null) =>
          score === null || score === undefined ? (
            '—'
          ) : (
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
        render: (v: string) => formatDateTime(v, locale),
      },
    ],
    [t, locale, templateNameById],
  )

  /**
   * 打开申报详情：先用列表行数据即时展示，再请求详情接口补充附件下载地址（file_urls）。
   * @param record 列表行数据（必填）
   */
  const openDetail = useCallback(
    async (record: PartyScore) => {
      setDetail(record)
      setDetailLoading(true)
      setDetailError(null)
      try {
        // 详情包含附件下载地址，打开时绕过缓存重新请求，避免展示旧数据导致看不到附件
        setDetail(await getPartyScore(record.id, true))
      } catch (err) {
        setDetailError(extractErrorReason(err, t))
      } finally {
        setDetailLoading(false)
      }
    },
    [t],
  )

  /** 关闭申报详情并清理加载 / 错误状态 */
  const closeDetail = () => {
    setDetail(null)
    setDetailError(null)
    setDetailLoading(false)
  }

  /** 提交加分申请：成功后重置表单并刷新本人申报记录（代码要求 13） */
  const onFinish = async (values: DeclarationFormValues) => {
    if (myUid === null) return
    setSubmitting(true)
    try {
      await createPartyScore({
        template_id: values.template_id,
        requested_score: values.requested_score,
        // files 为必填字段：无附件时传空数组，申请人由后端按登录身份确定
        files: values.files ?? [],
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
                {/* 后端分数为 DecimalText（字符串），用 stringMode 采集并原样提交 */}
                <InputNumber style={{ width: 180 }} stringMode step="1" />
              </Form.Item>

              <Form.Item
                name="files"
                label={t('partyDeclaration.fieldFiles')}
                extra={t('partyDeclaration.filesHint')}
              >
                <AttachmentUploader maxCount={PARTY_DECLARATION_MAX_FILES} />
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
                onClick: () => void openDetail(record),
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
        onCancel={closeDetail}
        footer={<Button onClick={closeDetail}>{t('partyDeclaration.close')}</Button>}
      >
        {detail ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('partyDeclaration.colId')}>{detail.id}</Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.colDeclType')}>
              {templateNameById.get(detail.template_id) ?? detail.template_id}
            </Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.colScore')}>
              {formatPartyScore(detail.requested_score)}
            </Descriptions.Item>
            <Descriptions.Item label={t('partyDeclaration.colApproved')}>
              {formatPartyScore(detail.approved_score)}
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
            <Descriptions.Item label={t('partyDeclaration.fieldFiles')}>
              {detailLoading ? (
                t('common.loading')
              ) : detailError ? (
                <ErrorState message={detailError} onRetry={() => void openDetail(detail)} />
              ) : (
                <AttachmentLinks
                  urls={detail.file_urls}
                  emptyText={t('leaveDetail.noAttachment')}
                />
              )}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </div>
  )
}
