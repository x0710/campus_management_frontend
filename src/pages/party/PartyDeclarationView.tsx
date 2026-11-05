import { isEntryActionTarget } from '../../utils/entryInteraction'
/**
 * 党员端「成绩申报」：申报表单 + 我的申报记录。
 *
 * 对接后端党建活动加分接口（/api/party-scores，见 api/partyScores.ts）：
 *   POST /api/files          上传凭证附件，返回文件 ID
 *   POST /api/party-scores   提交加分申请（template_id + requested_score + files 附件 ID 列表；申请人由后端按登录身份确定）
 *   GET  /api/party-scores/{id}             查询加分申请详情（含 file_urls 附件下载地址）
 *   GET  /api/party-scores?user_id=..       查询本人申报记录（分页；user_id 需显式传入，接口不会自动限定当前用户）
 * 「申报类型」取自审批模板 GET /api/approvals/templates（business_type='party'，见 config/partyDeclaration.ts）。
 * 下拉支持输入搜索：停止输入 1 秒后才带 keyword 请求服务端模糊匹配（名称 / 编码），
 * 避免连续输入时频繁请求；已选模板与已加载模板名称会被保留，不会因搜索结果缩窄而回退成 ID。
 *
 * 「我的申报记录」展示审核进度（审核中 / 申请成功 / 被驳回，判定口径与首页近期记录一致，
 * 必须所有审批环节完成才算申请成功）；双击记录行跳转到独立申报详情页
 * （复用首页的 PartyScoreDetailPage，展示申请内容 + 审核内容，不再弹窗）。
 *
 * 附件：先上传文件拿 ID，再随创建请求的 files 字段提交，实现申请与附件匹配；
 * 后端加分接口不提供申报时段 / 事由 / 撤回 / 删除，故页面不展示这些字段与操作。
 * 按代码要求 4，接口细节只写在注释里，不进入页面文案。
 */
import { isPartyScoreDeduction } from '../../utils/partyScore'
import { ReloadOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Form, Input, InputNumber, Select, Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getApprovalTemplateDetail, queryApprovalTemplates } from '../../api/approvalmodel'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { createPartyScore, hydratePartyScoreRows, queryPartyScores } from '../../api/partyScores'
import type { ApprovalTemplate } from '../../api/types/approvalmodel'
import type { PaginatedResponse } from '../../api/types/common'
import type { PartyScore } from '../../api/types/partyScores'
import AttachmentUploader from '../../components/AttachmentUploader'
import ErrorState from '../../components/ErrorState'
import {
  PARTY_DECLARATION_MAX_FILES,
  PARTY_DECLARATION_PAGE_SIZE,
  PARTY_SCORE_APPLICATION_STATUS_COLOR,
  PARTY_TEMPLATE_BUSINESS_TYPE,
  PARTY_TEMPLATE_SEARCH_DEBOUNCE_MS,
} from '../../config/partyDeclaration'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { usePaginated } from '../../hooks/usePaginated'
import { usePartyScoreApplicationStatuses } from '../../composables/usePartyScoreApplicationStatuses'
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
  /** 申请理由 */
  reason: string
  /** 附件文件 ID 列表（由 AttachmentUploader 上传 /api/files 后回填） */
  files?: number[]
}

/** 已选模板的加分细则状态 */
interface TemplateRulesState {
  /** 模板 ID */
  templateId: number
  /** 加分细则（模板 description；未配置时为 null） */
  description: string | null
  /** 详情接口是否加载中 */
  loading: boolean
  /** 详情接口错误文案（加载失败时展示重试） */
  error: string | null
}

/** 党员端：成绩申报（表单 + 本人申报记录） */
export default function PartyDeclarationView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()
  const navigate = useNavigate()
  const { portalKey, moduleKey } = useParams<{ portalKey: string; moduleKey?: string }>()
  const [form] = Form.useForm<DeclarationFormValues>()

  const [submitting, setSubmitting] = useState(false)
  /** 当前登录用户 ID（用于按 user_id 过滤本人记录；就绪前不拉取列表，避免取到他人数据） */
  const [myUid, setMyUid] = useState<number | null>(null)
  /** 申报类型可选模板（审批模板，business_type='party'） */
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([])
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  /** 申报类型下拉是否正在请求（输入搜索 / 初次加载） */
  const [templatesLoading, setTemplatesLoading] = useState(true)
  /**
   * 模板 ID → 名称的累积映射：每次搜索的结果都合并进来（只增不减），
   * 避免输入搜索后下拉只含匹配项时，申报记录里的其他模板名称回退成 ID。
   */
  const [templateNames, setTemplateNames] = useState<Map<number, string>>(new Map())
  /** 当前选中的模板：搜索后结果不含它时，下拉与加分细则仍能展示名称 */
  const [selectedTemplate, setSelectedTemplate] = useState<ApprovalTemplate | null>(null)
  /** 模板搜索请求序号：快速连续搜索时丢弃过期响应 */
  const templatesReqRef = useRef(0)
  /** 申报类型输入搜索的防抖计时器（停止输入 1 秒后再请求） */
  const templateSearchTimerRef = useRef<number | null>(null)
  /** 已选模板的加分细则（选择申报类型后从模板详情接口加载） */
  const [rules, setRules] = useState<TemplateRulesState | null>(null)
  /** 加分细则请求序号：快速切换模板时丢弃过期响应 */
  const rulesReqRef = useRef(0)

  /**
   * 加载成绩申报可用的审批模板（服务端按 keyword 模糊匹配模板名称 / 编码）。
   * 初次加载或重试失败时在表单区展示错误与重试（代码要求 9）；
   * 输入关键字搜索失败时只弹提示、保留当前选项，避免整块表单被错误页替换。
   * @param keyword 搜索关键字（可选，空值表示加载全部可用模板）
   * @param options 额外选项（可选）：force 绕过会话缓存、silent 静默失败
   */
  const loadTemplates = useCallback(
    async (keyword?: string, options?: { force?: boolean; silent?: boolean }) => {
      const reqId = templatesReqRef.current + 1
      templatesReqRef.current = reqId
      const silent = options?.silent ?? false
      setTemplatesLoading(true)
      if (!silent) setTemplatesError(null)
      try {
        const res = await queryApprovalTemplates(
          {
            business_type: PARTY_TEMPLATE_BUSINESS_TYPE,
            enabled: true,
            page: 1,
            page_size: PARTY_DECLARATION_PAGE_SIZE,
            keyword: keyword?.trim() ? keyword.trim() : undefined,
          },
          options?.force,
        )
        if (templatesReqRef.current !== reqId) return
        setTemplates(res.data)
        // 合并名称映射（搜索只覆盖下拉可选范围，记录展示仍需要全部已知模板名称）
        setTemplateNames((prev) => {
          const merged = new Map(prev)
          res.data.forEach((item) => merged.set(item.id, item.name))
          return merged
        })
      } catch (err) {
        if (templatesReqRef.current !== reqId) return
        if (silent) {
          reportError(err)
        } else {
          setTemplatesError(extractErrorReason(err, t))
        }
      } finally {
        if (templatesReqRef.current === reqId) setTemplatesLoading(false)
      }
    },
    [reportError, t],
  )

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  /** 卸载时清理尚未触发的搜索防抖计时器 */
  useEffect(
    () => () => {
      if (templateSearchTimerRef.current !== null) {
        window.clearTimeout(templateSearchTimerRef.current)
        templateSearchTimerRef.current = null
      }
    },
    [],
  )

  /**
   * 加载所选模板的加分细则：先用列表里的 description 即时展示，再用模板详情接口
   * （GET /api/approvals/templates/{id}）返回的 description 覆盖，保证以详情为准。
   * 快速切换模板时按请求序号丢弃过期响应。
   * @param templateId 模板 ID（必填）
   * @param force 是否绕过会话缓存（可选，默认 false；点击重试时传 true）
   */
  const loadRules = useCallback(
    async (templateId: number, force = false) => {
      const reqId = rulesReqRef.current + 1
      rulesReqRef.current = reqId
      const fallback = templates.find((item) => item.id === templateId)?.description ?? null
      setRules({ templateId, description: fallback, loading: true, error: null })
      try {
        const detail = await getApprovalTemplateDetail(templateId, force)
        if (rulesReqRef.current !== reqId) return
        setRules({
          templateId,
          description: detail.description?.trim() ? detail.description : null,
          loading: false,
          error: null,
        })
      } catch (err) {
        if (rulesReqRef.current !== reqId) return
        setRules({
          templateId,
          description: null,
          loading: false,
          error: extractErrorReason(err, t),
        })
      }
    },
    [t, templates],
  )

  /**
   * 申报类型输入搜索：输入停止 1 秒后才按关键字请求模糊匹配。
   * 连续输入会重置计时器，避免每敲一个字都发一次请求。
   * @param value 搜索关键字（必填，可为空串表示恢复全部模板）
   */
  const onTemplateSearch = useCallback(
    (value: string) => {
      if (templateSearchTimerRef.current !== null) {
        window.clearTimeout(templateSearchTimerRef.current)
      }
      templateSearchTimerRef.current = window.setTimeout(() => {
        templateSearchTimerRef.current = null
        void loadTemplates(value, { silent: true })
      }, PARTY_TEMPLATE_SEARCH_DEBOUNCE_MS)
    },
    [loadTemplates],
  )

  /**
   * 选择申报类型：记录已选模板（搜索后其不在结果中也仍展示名称），并加载其加分细则。
   * @param value 选中的模板 ID（可为 undefined，表示清空选择）
   */
  const onTemplateChange = useCallback(
    (value: number | undefined) => {
      const picked =
        value === undefined ? null : templates.find((item) => item.id === value) ?? null
      setSelectedTemplate(picked)
      if (value === undefined) {
        setRules(null)
        // 使仍在途的加分细则请求失效，避免清空选择后右侧仍展示旧模板细则
        rulesReqRef.current += 1
        return
      }
      void loadRules(value)
    },
    [loadRules, templates],
  )

  /** 申报类型下拉选项：当前结果 + 已选模板兜底（搜索后已选项不在结果中仍显示名称） */
  const templateOptions = useMemo(() => {
    const options = templates.map((item) => ({
      value: item.id,
      label: item.name,
      title: item.description || item.name,
    }))
    if (selectedTemplate && !templates.some((item) => item.id === selectedTemplate.id)) {
      options.unshift({
        value: selectedTemplate.id,
        label: selectedTemplate.name,
        title: selectedTemplate.description || selectedTemplate.name,
      })
    }
    return options
  }, [templates, selectedTemplate])

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
      async (query, force): Promise<PaginatedResponse<PartyScore>> => {
        if (myUid === null) {
          return Promise.resolve({
            data: [],
            total: 0,
            page: 1,
            page_size: query.page_size ?? PARTY_DECLARATION_PAGE_SIZE,
            total_pages: 0,
          })
        }
        const res = await queryPartyScores({ ...query, user_id: myUid }, force)
        // 列表摘要可能缺 template_id / created_at，详情接口才有；这里补齐后再交给表格展示
        return { ...res, data: await hydratePartyScoreRows(res.data, force) }
      },
    )

  /** 我的申报记录审核进度：审批记录 + 模板步骤判定，与首页近期记录同一口径 */
  const { statuses } = usePartyScoreApplicationStatuses(data)

  /** user_id 就绪后重新拉取本人申报记录 */
  useEffect(() => {
    if (myUid !== null) reload()
  }, [myUid, reload])

  /** 申报类型 ID → 名称，用于列表与详情展示（累积全部已加载模板；查不到时回退展示 ID） */
  const templateNameById = templateNames

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
            ? templateNameById.get(row.template_id) ?? row.template_id
            : t('common.unknown'),
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
        // 审核进度：与首页近期记录一致，展示「审核中 / 申请成功 / 被驳回」，
        // 不直接展示申请分数，避免被误认为已获得成绩；状态未解析完成时显示加载中
        title: t('partyDeclaration.colReviewStatus'),
        key: 'review_status',
        width: 120,
        align: 'center',
        render: (_, record) => {
          const status = statuses.get(record.id)
          if (isPartyScoreDeduction(record)) return <Tag color="error">{t('partyDeduction.success')}</Tag>
          return status ? (
            <Tag color={PARTY_SCORE_APPLICATION_STATUS_COLOR[status]}>
              {t(`partyDeclaration.applicationStatus_${status}`)}
            </Tag>
          ) : (
            <Spin size="small" />
          )
        },
      },
      {
        title: t('partyDeclaration.colCreatedAt'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (v: string) => formatDateTime(v, locale),
      },
    ],
    [t, locale, templateNameById, statuses],
  )

  /**
   * 打开申报详情：跳转独立详情页（复用首页近期记录的审批详细页），
   * 携带来源模块以便侧栏保持「成绩申报」高亮、返回按钮回到本页。
   * @param record 当前点击的申报记录（必填）
   */
  const openRecordDetail = (record: PartyScore) => {
    if (!portalKey) return
    navigate(
      `/portal/${portalKey}/party-scores/${record.id}?from=${moduleKey ?? 'party_m2'}`,
    )
  }

  /** 提交加分申请：成功后重置表单并刷新本人申报记录（代码要求 13） */
  const onFinish = async (values: DeclarationFormValues) => {
    if (myUid === null) return
    setSubmitting(true)
    try {
      await createPartyScore({
        template_id: values.template_id,
        requested_score: values.requested_score,
        reason: values.reason?.trim() ?? '',
        // files 为必填字段：无附件时传空数组，申请人由后端按登录身份确定
        files: values.files ?? [],
      })
      message.success(t('partyDeclaration.createSuccess'))
      form.resetFields()
      setRules(null)
      setSelectedTemplate(null)
      // 使仍在途的加分细则请求失效，避免提交后右侧闪现旧模板细则
      rulesReqRef.current += 1
      // 恢复完整的申报类型列表（清掉上一次输入搜索的结果）
      void loadTemplates()
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
            <div className="party-declaration-layout">
              <Form<DeclarationFormValues>
                form={form}
                layout="vertical"
                requiredMark={false}
                onFinish={onFinish}
                disabled={myUid === null}
              >
                {/* 申报类型与申请加分并排（申请加分置于右侧），申请理由独占整行 */}
                <div className="party-declaration-row">
                  <Form.Item
                    name="template_id"
                    label={t('partyDeclaration.fieldType')}
                    rules={[{ required: true, message: t('partyDeclaration.typeRequired') }]}
                  >
                    <Select
                      showSearch
                      // 关键字由服务端按名称 / 编码模糊匹配（输入停止 1 秒后才搜索），前端不做本地过滤
                      filterOption={false}
                      loading={templatesLoading}
                      notFoundContent={
                        templatesLoading ? <Spin size="small" /> : t('common.noData')
                      }
                      placeholder={t('partyDeclaration.typeRequired')}
                      options={templateOptions}
                      onSearch={onTemplateSearch}
                      // 选择模板后立即加载并展示该模板的加分细则（代码要求 14）
                      onChange={onTemplateChange}
                    />
                  </Form.Item>

                  <Form.Item
                    name="requested_score"
                    label={t('partyDeclaration.fieldScore')}
                    rules={[{ required: true, message: t('partyDeclaration.scoreRequired') }]}
                  >
                    {/* 后端分数为 DecimalText（字符串），用 stringMode 采集并原样提交 */}
                    <InputNumber stringMode step="1" />
                  </Form.Item>
                </div>

                <Form.Item
                  name="reason"
                  label={t('partyDeclaration.fieldReason')}
                  rules={[{ required: true, message: t('partyDeclaration.reasonRequired') }]}
                >
                  <Input.TextArea
                    rows={8}
                    maxLength={200}
                    showCount
                    placeholder={t('partyDeclaration.reasonPlaceholder')}
                  />
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

              {/* 右侧加分细则：数据来自模板详情接口的 description（未选择模板时给出提示） */}
              <aside className="party-declaration-rules" aria-live="polite">
                <div className="party-declaration-rules-title">
                  {t('partyDeclaration.rulesTitle')}
                </div>
                {rules === null ? (
                  <p className="party-declaration-rules-hint">
                    {t('partyDeclaration.rulesHint')}
                  </p>
                ) : (
                  <>
                    <div className="party-declaration-rules-name">
                      {/* 名称用累积映射：搜索后已选模板可能不在当前下拉结果中 */}
                      {templateNameById.get(rules.templateId) ?? rules.templateId}
                    </div>
                    {rules.loading && rules.description?.trim() ? (
                      // 列表已带回加分细则时先展示，详情接口返回后再覆盖
                      <p className="party-declaration-rules-text">{rules.description}</p>
                    ) : rules.loading ? (
                      <span className="party-declaration-rules-loading">
                        <Spin size="small" /> {t('common.loading')}
                      </span>
                    ) : rules.error ? (
                      <ErrorState
                        message={rules.error}
                        onRetry={() => void loadRules(rules.templateId, true)}
                      />
                    ) : rules.description?.trim() ? (
                      <p className="party-declaration-rules-text">{rules.description}</p>
                    ) : (
                      <p className="party-declaration-rules-hint">
                        {t('partyDeclaration.rulesNone')}
                      </p>
                    )}
                  </>
                )}
              </aside>
            </div>
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
              scroll={{ x: 880 }}
              onRow={(record) => ({
                onDoubleClick: (event) => {
                  if (isEntryActionTarget(event.target)) return
                  openRecordDetail(record)
                },
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
    </div>
  )
}
