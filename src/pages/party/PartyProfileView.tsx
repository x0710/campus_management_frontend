import { BellOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Avatar, Button, Card, Collapse, Descriptions, Empty, Pagination, Popconfirm, Skeleton, Space, Spin, Steps, Tabs, Tag } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getApprovalTemplateDetail, mockApprovalTemplate, queryApprovalTemplates } from '../../api/approvalmodel'
import { getMyRoles } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { deleteNotice, markNoticeRead, markNoticeUnread, queryNotices } from '../../api/notices'
import { listUserOrganizations } from '../../api/organizations'
import { getMyProfile } from '../../api/users'
import type { ApprovalStep, ApprovalTemplate, MockApprovalApprover } from '../../api/types/approvalmodel'
import type { Notice } from '../../api/types/notices'
import type { UserOrganization } from '../../api/types/organizations'
import type { UserRoleInfo } from '../../api/types/rbac'
import type { UserDetail } from '../../api/types/users'
import ErrorState from '../../components/ErrorState'
import PartyScoreRecords from '../../components/PartyScoreRecords'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import {
  APPROVAL_TEMPLATE_PAGE_SIZE,
  getBusinessTypeColor,
  getBusinessTypeLabel,
} from '../../config/approvalTemplate'
import { NOTICE_CATEGORY_LABEL_KEYS } from '../../config/notices'
import { PARTY_NOTICE_PAGE_SIZE } from '../../config/partyDeclaration'
import { PARTY_POLITICAL_STATUS_NAMES } from '../../config/partyProfile'
import { useCurrentIdentity } from '../../composables/useCurrentIdentity'
import { usePositionNames } from '../../composables/usePositionNames'
import { useUserNames } from '../../composables/useUserNames'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

/**
 * 党员端：我的（我的成绩记录 / 年度评价报告 / 消息通知 / 审批指南 / 关于井大大先锋）。
 * 「我的档案」按学生端个人信息页展示真实基本资料（GET /api/users/me），
 * 并保留党员编号 / 所属支部 / 政治面貌 / 入党时间等党员端扩展信息。
 * 党员编号 / 政治面貌 / 入党时间后端暂无接口，暂以预览值展示；所属支部取真实任职组织。
 * 我的成绩记录：复用总成绩概览（PartyScoreSummary）与成绩记录表格（PartyScoreRecords）。
 * 消息通知：分页展示站内通知（GET /api/notices），点击未读项标记已读。
 */

/** 我的档案：基本信息 + 党员端扩展信息 */
function ProfileDescriptions() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const username = useAuthStore((s) => s.username)
  const positionNames = usePositionNames()
  const { name, organizations } = useCurrentIdentity()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [roles, setRoles] = useState<UserRoleInfo[]>([])
  const [orgs, setOrgs] = useState<UserOrganization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const profile = await getMyProfile()
      setUser(profile)

      // 角色 / 组织任职单个失败不阻塞档案主体展示
      const [roleItems, orgItems] = await Promise.all([
        getMyRoles().catch(() => []),
        listUserOrganizations(profile.id).catch(() => []),
      ])
      setRoles(roleItems)
      setOrgs(orgItems)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return
      setError(extractErrorReason(err, t))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  // 姓名：真实姓名优先，取不到时回退账户名，最后回退占位符
  const displayName = user?.name?.trim() || name?.trim() || username || t('common.unknown')
  // 所属支部：取第一项任职组织名称，无任职时回退占位符
  const displayBranch = organizations[0] || t('common.unknown')
  // 政治面貌：遍历任职组织的职位名称，仅命中党员身份时展示，其余职位（如书记）忽略
  const politicalStatus = orgs
    .map((org) => positionNames.get(org.position)?.trim() ?? '')
    .find((positionName) => PARTY_POLITICAL_STATUS_NAMES.includes(positionName))
  const genderLabel =
    user?.gender === 'male'
      ? t('profile.male')
      : user?.gender === 'female'
        ? t('profile.female')
        : t('profile.unknown')

  if (loading) {
    return <Skeleton active paragraph={{ rows: 8 }} />
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />
  }

  if (!user) {
    return <Empty description={t('profile.noData')} />
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch', width: '100%' }}>
        <Card size="small" title={t('profile.basicInfo')} style={{ flex: '1 1 480px', minWidth: 0 }}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label={t('profile.name')}>{displayName}</Descriptions.Item>
            <Descriptions.Item label={t('profile.gender')}>{genderLabel}</Descriptions.Item>
            <Descriptions.Item label={t('profile.email')}>
              {user.email?.trim() || t('profile.noData')}
            </Descriptions.Item>
            <Descriptions.Item label={t('profile.phone')}>
              {user.phone?.trim() || t('profile.noData')}
            </Descriptions.Item>
            <Descriptions.Item label={t('profile.birthday')}>
              {user.birthday || t('profile.noData')}
            </Descriptions.Item>
            <Descriptions.Item label={t('profile.createdAt')}>
              {formatDateTime(user.created_at, locale)}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card size="small" title={t('profile.avatar')} style={{ flex: '0 0 168px' }}>
          {user.avatar && user.avatar.trim() ? (
            <Avatar shape="square" size={96} src={user.avatar} />
          ) : (
            <Avatar shape="square" size={96} icon={<UserOutlined />} />
          )}
        </Card>
      </div>

      <Card size="small" title={t('partyProfile.partyInfoTitle')}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label={t('partyProfile.fieldMemberNo')}>
            {t('common.noData')}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyProfile.fieldBranch')}>{displayBranch}</Descriptions.Item>
          <Descriptions.Item label={t('partyProfile.fieldPoliticalStatus')}>
            {politicalStatus ?? t('partyProfile.politicalNotFound')}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyProfile.fieldJoinDate')}>
            {t('common.noData')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title={t('profile.rolesTitle')}>
        {roles.length === 0 ? (
          <span>{t('profile.noData')}</span>
        ) : (
          <Space size={[8, 8]} wrap>
            {roles.map((role) => (
              <Tag key={role.id} color="blue">
                {role.name || role.code || role.id}
                {role.description ? ` (${role.description})` : ''}
              </Tag>
            ))}
          </Space>
        )}
      </Card>

      <Card size="small" title={t('profile.orgsTitle')}>
        {orgs.length === 0 ? (
          <span>{t('profile.noData')}</span>
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {orgs.map((org) => (
              <Card key={org.id} size="small" bordered style={{ background: 'transparent' }}>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label={t('profile.organization')}>
                    {org.organization_name}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('profile.position')}>
                    {org.position ? (
                      <Tag color="geekblue">
                        {positionNames.get(org.position) ?? org.position}
                      </Tag>
                    ) : (
                      t('profile.noData')
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('profile.workplace')} span={2}>
                    {org.workplace ?? t('profile.noData')}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ))}
          </Space>
        )}
      </Card>
    </Space>
  )
}

/** 占位内容（年度评价报告 / 关于井大大先锋 暂不实现） */
function Placeholder() {
  const t = useT()
  return (
    <div className="party-placeholder">
      <Alert
        type="warning"
        showIcon
        title={t('partyProfile.mockHint')}
        style={{ marginBottom: 12 }}
      />
      <Empty description={t('partyProfile.emptyHint')} />
    </div>
  )
}

/**
 * 审批指南：展示已启用的审批模板及其审批流程。
 * 列表取 GET /api/approvals/templates（会话缓存），只保留启用中的模板；
 * 展开某个模板时再按需请求 GET /api/approvals/templates/{id} 取步骤，避免一次性拉取全部详情。
 * 步骤中的「审批人角色」为职位编码，展示时映射为职位名称（映射失败回退编码）。
 */
function ApprovalGuide() {
  const t = useT()
  const positionNames = usePositionNames()
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)
  // 已加载的步骤详情：模板 ID → 步骤列表
  const [stepsByTemplate, setStepsByTemplate] = useState<Record<number, ApprovalStep[]>>({})
  // 正在请求步骤的模板 ID
  const [stepsLoading, setStepsLoading] = useState<number[]>([])
  // 步骤加载失败的模板 ID → 错误文案
  const [stepsError, setStepsError] = useState<Record<number, string>>({})
  // 已加载的模拟提交结果：模板 ID → 各步骤实际审批人（step_order 对应模板步骤 step_no）
  const [approversByTemplate, setApproversByTemplate] = useState<
    Record<number, MockApprovalApprover[]>
  >({})
  // 模拟提交失败的模板 ID → 错误文案
  const [approversError, setApproversError] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    queryApprovalTemplates({ page: 1, page_size: APPROVAL_TEMPLATE_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return
        // 后端 enabled 为 i8（1 启用 / 0 停用），审批指南只展示启用中的模板
        setTemplates(res.data.filter((row) => !!row.enabled))
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorReason(err, t))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadSeq, t])

  /** 重新拉取模板列表：先切回加载态并清空错误，再触发 effect 重查 */
  const reloadTemplates = () => {
    setError(null)
    setLoading(true)
    setReloadSeq((prev) => prev + 1)
  }

  // 汇总各模板模拟提交解析出的审批人 ID，统一批量解析姓名
  const approverIds = useMemo(
    () =>
      Object.values(approversByTemplate).flatMap((list) => list.map((item) => item.approver_id)),
    [approversByTemplate],
  )
  const approverNames = useUserNames(approverIds)

  const loadSteps = useCallback(
    async (templateId: number) => {
      setStepsLoading((prev) => (prev.includes(templateId) ? prev : [...prev, templateId]))
      setStepsError((prev) => {
        if (!(templateId in prev)) return prev
        const next = { ...prev }
        delete next[templateId]
        return next
      })
      setApproversError((prev) => {
        if (!(templateId in prev)) return prev
        const next = { ...prev }
        delete next[templateId]
        return next
      })
      const template = templates.find((row) => row.id === templateId)
      // 模拟提交：按模板所属组织解析各步骤实际审批人；模板缺失时降级为空列表
      const mockRequest = template
        ? mockApprovalTemplate(templateId, template.organization_id)
        : Promise.resolve<MockApprovalApprover[]>([])
      const [detailResult, approversResult] = await Promise.allSettled([
        getApprovalTemplateDetail(templateId),
        mockRequest,
      ])
      if (detailResult.status === 'fulfilled') {
        setStepsByTemplate((prev) => ({ ...prev, [templateId]: detailResult.value.steps ?? [] }))
      } else {
        setStepsError((prev) => ({ ...prev, [templateId]: extractErrorReason(detailResult.reason, t) }))
      }
      if (approversResult.status === 'fulfilled') {
        setApproversByTemplate((prev) => ({ ...prev, [templateId]: approversResult.value }))
      } else {
        setApproversError((prev) => ({
          ...prev,
          [templateId]: extractErrorReason(approversResult.reason, t),
        }))
      }
      setStepsLoading((prev) => prev.filter((id) => id !== templateId))
    },
    [t, templates],
  )

  /** 展开模板时懒加载其步骤详情（已加载 / 加载中 / 失败的不重复请求） */
  const handleExpand = (keys: string | string[]) => {
    const opened = Array.isArray(keys) ? keys : [keys]
    opened.forEach((key) => {
      const templateId = Number(key)
      if (
        stepsByTemplate[templateId] === undefined &&
        !stepsError[templateId] &&
        !stepsLoading.includes(templateId)
      ) {
        void loadSteps(templateId)
      }
    })
  }

  const renderSteps = (template: ApprovalTemplate) => {
    if (stepsLoading.includes(template.id)) {
      return (
        <div className="party-guide-loading">
          <Spin size="small" />
          <span>{t('common.loading')}</span>
        </div>
      )
    }
    const stepError = stepsError[template.id]
    if (stepError) {
      return <ErrorState message={stepError} onRetry={() => void loadSteps(template.id)} />
    }
    const steps = [...(stepsByTemplate[template.id] ?? [])].sort((a, b) => a.step_no - b.step_no)
    if (steps.length === 0) {
      return (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('partyProfile.guideStepsEmpty')} />
      )
    }
    const approvers = approversByTemplate[template.id] ?? []
    const approverError = approversError[template.id]
    return (
      <>
        <Steps
          direction="vertical"
          size="small"
          items={steps.map((step) => {
            const role = step.position
              ? positionNames.get(step.position) ?? step.position
              : step.assignee_value ?? t('partyProfile.guideRoleUnset')
            const approver = approvers.find((item) => item.step_order === step.step_no)
            const parts = []
            if (step.description?.trim()) parts.push(<div key="desc">{step.description}</div>)
            if (step.position && step.assignee_value) {
              parts.push(
                <div key="assignee">
                  {t('partyProfile.guideAssignee', { value: step.assignee_value })}
                </div>,
              )
            }
            if (approver) {
              const approverName = approverNames.get(approver.approver_id)
              parts.push(
                <div key="approver">
                  {t('partyProfile.guideApprover', {
                    name: approverName === undefined ? t('common.loading') : approverName ?? '-',
                  })}
                </div>,
              )
            }
            return {
              // 统一所有步骤为「进行中」态（process），让每步的圆圈与文字颜色都和第一步一致，
              // 避免 antd 默认仅把第 1 步高亮为蓝色、后续步骤置灰造成颜色不统一。
              status: 'process' as const,
              title: t('partyProfile.guideStepTitle', { no: step.step_no, role }),
              description: parts.length > 0 ? <>{parts}</> : undefined,
            }
          })}
        />
        {approverError ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
            message={t('partyProfile.guideApproverError', { reason: approverError })}
            action={
              <Button size="small" type="link" onClick={() => void loadSteps(template.id)}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}
      </>
    )
  }

  if (loading) {
    return (
      <div className="party-placeholder">
        <Spin />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={reloadTemplates} />
  }

  if (templates.length === 0) {
    return (
      <div className="party-placeholder">
        <Empty description={t('partyProfile.guideEmpty')} />
      </div>
    )
  }

  return (
    <div className="party-guide">
      <Collapse
        items={templates.map((template) => ({
          key: String(template.id),
          label: (
            <span className="party-guide-title">
              <span>{template.name}</span>
              <Tag color={getBusinessTypeColor(template.business_type)}>
                {getBusinessTypeLabel(template.business_type, t)}
              </Tag>
              <Tag color="geekblue">{template.code}</Tag>
            </span>
          ),
          children: (
            <div className="party-guide-body">
              {template.description?.trim() ? (
                <p className="party-guide-desc">{template.description}</p>
              ) : null}
              {renderSteps(template)}
            </div>
          ),
        }))}
        onChange={handleExpand}
      />
    </div>
  )
}

/** 消息通知列表：分页展示站内通知，点击未读项标记已读 */
function NotificationsList() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const [notices, setNotices] = useState<Notice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)

  useEffect(() => {
    let cancelled = false
    queryNotices({ page, page_size: PARTY_NOTICE_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return
        setNotices(res.data)
        setTotal(res.total)
      })
      .catch((err) => {
        if (cancelled) return
        // 401 由 http 拦截器统一处理登录态，此处不重复提示
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setError(extractErrorReason(err, t))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, reloadSeq, t])

  /** 重新加载（事件回调内可安全重置加载态） */
  const retry = () => {
    setError(null)
    setLoading(true)
    setReloadSeq((prev) => prev + 1)
  }

  /** 点击未读通知标记已读，并本地同步列表 */
  const handleRead = async (notice: Notice) => {
    if (notice.is_read) return
    try {
      await markNoticeRead(notice.id)
      setNotices((prev) =>
        prev.map((item) => (item.id === notice.id ? { ...item, is_read: true } : item)),
      )
    } catch {
      // 标记失败保持现状，下次加载时与后端对齐
    }
  }

  /** 设为未读：已读通知回退为未读态 */
  const handleMarkUnread = async (notice: Notice) => {
    if (!notice.is_read) return
    try {
      await markNoticeUnread(notice.id)
      setNotices((prev) =>
        prev.map((item) => (item.id === notice.id ? { ...item, is_read: false } : item)),
      )
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，其余按状态码提示（代码要求 9）
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        message.error(extractErrorReason(err, t))
      }
    }
  }

  /** 删除通知：本地移除并同步总数；当前页删空时回退上一页 */
  const handleDelete = async (notice: Notice) => {
    try {
      await deleteNotice(notice.id)
      const next = notices.filter((item) => item.id !== notice.id)
      setNotices(next)
      setTotal((prev) => Math.max(0, prev - 1))
      if (next.length === 0 && page > 1) setPage(page - 1)
      message.success(t('notice.deleteSuccess'))
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，其余按状态码提示（代码要求 9）
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        message.error(extractErrorReason(err, t))
      }
    }
  }

  if (loading) {
    return (
      <div className="party-placeholder">
        <Spin />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={retry} />
  }

  if (notices.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('notice.empty')} />
  }

  return (
    <div>
      <ul className="party-notif-list">
        {notices.map((item) => (
          <li
            key={item.id}
            className={
              item.is_read ? 'party-notif-item' : 'party-notif-item party-notif-item-unread'
            }
            title={item.is_read ? undefined : t('notice.readHint')}
            onClick={() => void handleRead(item)}
          >
            <div className="party-notif-head">
              <span className="party-notif-title">
                <BellOutlined className="party-notif-icon" />
                <Tag color="blue">{t(NOTICE_CATEGORY_LABEL_KEYS[item.category])}</Tag>
              </span>
              <span className="party-notif-time">
                {formatDateTime(item.created_at, locale)}
                {!item.is_read ? <span className="party-notif-unread-dot" /> : null}
              </span>
            </div>
            <div className="party-notif-body">{item.content}</div>
            <div className="party-notif-actions">
              {item.is_read ? (
                <Button type="link" size="small" onClick={(e) => {
                  e.stopPropagation()
                  void handleMarkUnread(item)
                }}>
                  {t('notice.markUnread')}
                </Button>
              ) : (
                <Button type="link" size="small" onClick={(e) => {
                  e.stopPropagation()
                  void handleRead(item)
                }}>
                  {t('notice.markRead')}
                </Button>
              )}
              <Popconfirm
                title={t('notice.deleteConfirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                onConfirm={() => void handleDelete(item)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('notice.delete')}
                </Button>
              </Popconfirm>
            </div>
          </li>
        ))}
      </ul>
      <div className="party-notif-pagination">
        <Pagination
          current={page}
          pageSize={PARTY_NOTICE_PAGE_SIZE}
          total={total}
          showSizeChanger={false}
          showQuickJumper
          showTotal={(n: number) =>
            `${t('common.total')} ${n} ${t('common.items')} · ${t('common.totalPages', {
              n: Math.max(1, Math.ceil(n / PARTY_NOTICE_PAGE_SIZE)),
            })}`
          }
          onChange={setPage}
        />
      </div>
    </div>
  )
}

export default function PartyProfileView() {
  const t = useT()

  const items = [
    { key: 'profile', label: t('partyProfile.tabProfile'), children: <ProfileDescriptions /> },
    {
      key: 'scores',
      label: t('partyProfile.tabScores'),
      children: (
        <div className="party-tab-body">
          <PartyScoreSummary />
          <PartyScoreRecords />
        </div>
      ),
    },
 
    { key: 'notifications', label: t('partyProfile.tabNotifications'), children: <NotificationsList /> },
    { key: 'guide', label: t('partyProfile.tabGuide'), children: <ApprovalGuide /> },
    { key: 'about', label: t('partyProfile.tabAbout'), children: <Placeholder /> },
  ]

  return (
    // 数据展示页固定布局：仅卡片体内的各 Tab 数据区滚动（代码要求 23）
    <div className="data-page-view">
      <section className="panel-card">
        <div className="panel-card-body">
          <Tabs items={items} />
        </div>
      </section>
    </div>
  )
}
