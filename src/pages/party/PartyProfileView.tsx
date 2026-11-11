import CreatedDateFilter from '../../components/CreatedDateFilter'
import type { CreatedDateQuery } from '../../api/types/common'
/** 党员端 - 党员档案页。 */

import { isVisibleUserRole } from '../../config/rbac'
import { useRequestSequence } from '../../composables/useRequestSequence'
import { usePositionFormatter, usePositionLabel } from '../../composables/usePositionLabel'
import { BellOutlined, EditOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Avatar, Button, Card, Collapse, DatePicker, Descriptions, Empty, Form, Input, InputNumber, Modal, Pagination, Popconfirm, Skeleton, Space, Spin, Steps, Tabs, Tag } from 'antd'
import axios from 'axios'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getApprovalTemplateDetail, mockApprovalTemplate, queryApprovalTemplates } from '../../api/approvalmodel'
import { getMyRoles } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { deleteNotice, markNoticeRead, markNoticeUnread, queryNotices } from '../../api/notices'
import { getPosition } from '../../api/positions'
import { listUserOrganizations } from '../../api/organizations'
import { getMyProfile, updateUser } from '../../api/users'
import { createPartyProfile, updatePartyProfile } from '../../api/partyProfiles'
import type { ApprovalStep, ApprovalTemplate, MockApprovalApprover } from '../../api/types/approvalmodel'
import type { Notice } from '../../api/types/notices'
import type { UserOrganization } from '../../api/types/organizations'
import type { UserRoleInfo } from '../../api/types/rbac'
import type { UserDetail } from '../../api/types/users'
import ErrorState from '../../components/ErrorState'
import PartyScoreRecords from '../../components/PartyScoreRecords'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import PartyPersonalDetails from '../../components/PartyPersonalDetails'
import {
  APPROVAL_TEMPLATE_PAGE_SIZE,
} from '../../config/approvalTemplate'
import { NOTICE_CATEGORY_LABEL_KEYS } from '../../config/notices'
import { PARTY_NOTICE_PAGE_SIZE } from '../../config/partyDeclaration'
import { PARTY_POLITICAL_STATUS_NAMES } from '../../config/partyProfile'
import { useCurrentIdentity } from '../../composables/useCurrentIdentity'
import { usePartyProfiles } from '../../composables/usePartyProfiles'
import { useApprovalNoticeNavigation } from '../../composables/useApprovalNoticeNavigation'
import { useUserNames } from '../../composables/useUserNames'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'
import { useSettingsStore } from '../../store/settings'
import { formatDateOnly, formatDateTime } from '../../utils/datetime'
import { normalizeGender } from '../../utils/gender'
import OrganizationName from '../../components/OrganizationName'
import MyWorkplaceField from '../../components/MyWorkplaceField'

/**
 * 党员端：我的（我的成绩记录 / 年度评价报告 / 消息通知 / 审批指南 / 关于井大大先锋）。
 * 「我的档案」按学生端个人信息页展示真实基本资料（GET /api/users/me），
 * 并保留党员编号 / 所属支部 / 政治面貌 / 入党时间等党员端扩展信息。
 * 党员编号 / 入党时间取 GET /api/party/profiles；政治面貌取任职职位名称；所属支部取真实任职组织。
 * 我的成绩记录：复用总成绩概览（PartyScoreSummary）与成绩记录表格（PartyScoreRecords）。
 * 消息通知：分页展示站内通知（GET /api/notices），点击未读项标记已读。
 */

/** 我的档案：基本信息 + 党员端扩展信息 */
function ProfileDescriptions() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const username = useAuthStore((s) => s.username)
  const [positionNames, setPositionNames] = useState<Map<string, string>>(new Map())
  const [positionsError, setPositionsError] = useState<string | null>(null)
  const positionLabel = usePositionFormatter(positionNames)
  const { name, organizations } = useCurrentIdentity()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [roles, setRoles] = useState<UserRoleInfo[]>([])
  const visibleRoles = roles.filter(isVisibleUserRole)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [orgsError, setOrgsError] = useState<string | null>(null)
  const [extrasLoading, setExtrasLoading] = useState(false)
  const requests = useRequestSequence()
  const extrasRequests = useRequestSequence()
  const [orgs, setOrgs] = useState<UserOrganization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { message } = AntdApp.useApp()
  // 基本信息编辑弹窗：仅手机号、邮箱可编辑
  const [basicEditOpen, setBasicEditOpen] = useState(false)
  const [basicSaving, setBasicSaving] = useState(false)
  const [basicForm] = Form.useForm<{ phone: string; email: string }>()
  const [partyEditOpen, setPartyEditOpen] = useState(false)
  const [partySaving, setPartySaving] = useState(false)
  const [partyForm] = Form.useForm<{ party_no: number | null; join_time: Dayjs | null }>()
  // 党员编号 / 入党时间：拿到当前用户 ID 后按需查询党员档案
  const {
    profiles: partyProfiles,
    loading: partyProfilesLoading,
    notFound: partyProfilesNotFound,
    refresh: refreshPartyProfiles,
  } = usePartyProfiles(user ? [user.id] : [])

  const loadExtras = useCallback(async (userId: number) => {
    const isCurrent = extrasRequests.begin()
    setExtrasLoading(true)
    setRolesError(null)
    setOrgsError(null)
    setPositionsError(null)
    setPositionNames(new Map())
    const [roleResult, orgResult] = await Promise.allSettled([
      getMyRoles(), listUserOrganizations(userId),
    ])
    if (!isCurrent()) return
    if (roleResult.status === 'fulfilled') setRoles(roleResult.value)
    else setRolesError(extractErrorReason(roleResult.reason, t))
    if (orgResult.status === 'fulfilled') {
      setOrgs(orgResult.value)
      const codes = [...new Set(orgResult.value.map((org) => org.position).filter(Boolean))]
      const details = await Promise.allSettled(codes.map((code) => getPosition(code)))
      if (!isCurrent()) return
      const names = new Map<string, string>()
      for (const detail of details) {
        if (detail.status === 'fulfilled') names.set(detail.value.code, detail.value.name)
        else setPositionsError(extractErrorReason(detail.reason, t))
      }
      setPositionNames(names)
    } else setOrgsError(extractErrorReason(orgResult.reason, t))
    setExtrasLoading(false)
  }, [extrasRequests, t])

  const load = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    try {
      const profile = await getMyProfile()
      if (!isCurrent()) return
      setUser(profile)
      void loadExtras(profile.id)
    } catch (err) {
      if (!isCurrent() || (axios.isAxiosError(err) && err.response?.status === 401)) return
      setError(extractErrorReason(err, t))
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [requests, loadExtras, t])

  useEffect(() => {
    void load()
    return () => { requests.invalidate(); extrasRequests.invalidate() }
  }, [load, requests, extrasRequests])

  /** 打开基本信息编辑弹窗：仅回填手机号与邮箱 */
  const openBasicEdit = () => {
    basicForm.setFieldsValue({
      phone: user?.phone ?? '',
      email: user?.email ?? '',
    })
    setBasicEditOpen(true)
  }

  /** 保存手机号 / 邮箱（姓名、性别、生日等其余资料只读） */
  const saveBasicInfo = async () => {
    if (!user) return
    let values: { phone: string; email: string }
    try {
      values = await basicForm.validateFields()
    } catch {
      return
    }
    setBasicSaving(true)
    try {
      const phone = values.phone?.trim() || null
      const email = values.email?.trim() || null
      await updateUser(user.id, { phone, email })
      // 同步本地展示；接口缓存已在 updateUser 内失效，下次重新进入会拉取最新资料
      setUser((prev) => (prev ? { ...prev, phone, email } : prev))
      message.success(t('profile.saveSuccess'))
      setBasicEditOpen(false)
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        message.error(extractErrorReason(err, t))
      }
    } finally {
      setBasicSaving(false)
    }
  }

  // 姓名：真实姓名优先，取不到时回退账户名，最后回退占位符
  const displayName = user?.name?.trim() || name?.trim() || username || t('common.unknown')
  // 所属支部：取第一项任职组织名称，无任职时回退占位符
  const displayBranch = organizations[0] || t('common.unknown')
  // 党员档案：当前用户的党员编号 / 入党时间（无档案时展示未查到，字段为空时展示暂无数据）
  const partyProfile = user ? partyProfiles.get(user.id) : undefined
  const partyProfileNotFound = user ? partyProfilesNotFound.has(user.id) : false
  const openPartyEdit = () => {
    const joinTime = partyProfile?.join_time ? dayjs(partyProfile.join_time) : null
    partyForm.setFieldsValue({
      party_no: partyProfile?.party_no ?? null,
      join_time: joinTime?.isValid() ? joinTime : null,
    })
    setPartyEditOpen(true)
  }
  const savePartyInfo = async () => {
    if (!user || partySaving) return
    let values: { party_no: number | null; join_time: Dayjs | null }
    try {
      values = await partyForm.validateFields()
    } catch {
      return
    }
    setPartySaving(true)
    try {
      const body = {
        party_no: values.party_no ?? null,
        join_time: values.join_time ? values.join_time.format('YYYY-MM-DD') : null,
      }
      if (partyProfile) await updatePartyProfile(user.id, body)
      else await createPartyProfile({ user_id: user.id, ...body })
      refreshPartyProfiles()
      setPartyEditOpen(false)
      message.success(t('partyProfile.saveSuccess'))
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        message.error(extractErrorReason(err, t))
      }
    } finally {
      setPartySaving(false)
    }
  }
  // 政治面貌：遍历任职组织的职位名称，仅命中党员身份时展示，其余职位（如书记）忽略
  const politicalStatus = orgs
    .map((org) => positionNames.get(org.position)?.trim() ?? '')
    .find((positionName) => PARTY_POLITICAL_STATUS_NAMES.includes(positionName))
  const gender = normalizeGender(user?.gender)
  const genderLabel =
    gender === 'male'
      ? t('profile.male')
      : gender === 'female'
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
    <>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch', width: '100%' }}>
        <Card
          size="small"
          title={t('profile.basicInfo')}
          style={{ flex: '1 1 480px', minWidth: 0 }}
          extra={
            <Button
              type="primary"
              size="small"
              icon={<EditOutlined />}
              onClick={openBasicEdit}
            >
              {t('common.edit')}
            </Button>
          }
        >
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label={t('profile.name')}>{displayName}</Descriptions.Item>
            <Descriptions.Item label={t('profile.accountName')}>
              {username?.trim() || t('profile.noData')}
            </Descriptions.Item>
            <Descriptions.Item label={t('profile.gender')}>{genderLabel}</Descriptions.Item>
            <Descriptions.Item label={t('profile.email')}>
              {user.email?.trim() || t('profile.noData')}
            </Descriptions.Item>
            <Descriptions.Item label={t('profile.phone')}>
              {user.phone?.trim() || t('profile.noData')}
            </Descriptions.Item>
            <Descriptions.Item label={t('profile.birthday')}>
              {user.birthday ? formatDateOnly(user.birthday) : t('profile.noData')}
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

      <PartyPersonalDetails userId={user.id} />

      <Card size="small" title={t('partyProfile.partyInfoTitle')} extra={
        <Button type="primary" size="small" icon={<EditOutlined />}
          disabled={partyProfilesLoading || (!partyProfile && !partyProfileNotFound)}
          onClick={openPartyEdit}>{t('common.edit')}</Button>
      }>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label={t('partyProfile.fieldMemberNo')}>
            {partyProfilesLoading
              ? t('common.loading')
              : partyProfileNotFound
                ? t('common.notFound')
                : partyProfile?.party_no != null
                  ? String(partyProfile.party_no)
                  : t('common.noData')}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyProfile.fieldBranch')}>{displayBranch}</Descriptions.Item>
          <Descriptions.Item label={t('partyProfile.fieldPoliticalStatus')}>
            {politicalStatus ?? t('partyProfile.politicalNotFound')}
          </Descriptions.Item>
          <Descriptions.Item label={t('partyProfile.fieldJoinDate')}>
            {partyProfilesLoading
              ? t('common.loading')
              : partyProfileNotFound
                ? t('common.notFound')
                : partyProfile?.join_time?.trim()
                  ? formatDateOnly(partyProfile.join_time)
                  : t('common.noData')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title={t('profile.rolesTitle')}>
        {rolesError ? (
          <ErrorState message={rolesError} onRetry={() => user && void loadExtras(user.id)} />
        ) : extrasLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : visibleRoles.length === 0 ? (
          <span>{t('profile.noData')}</span>
        ) : (
          <Space size={[8, 8]} wrap>
            {visibleRoles.map((role) => (
              <Tag key={role.id} color="blue">
                {role.name || role.code || role.id}
                {role.description ? ` (${role.description})` : ''}
              </Tag>
            ))}
          </Space>
        )}
      </Card>

      <Card size="small" title={t('profile.orgsTitle')}>
        {positionsError && (
          <ErrorState message={positionsError} onRetry={() => user && void loadExtras(user.id)} style={{ marginBottom: 12 }} />
        )}
        {orgsError ? (
          <ErrorState message={orgsError} onRetry={() => user && void loadExtras(user.id)} />
        ) : extrasLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : orgs.length === 0 ? (
          <span>{t('profile.noData')}</span>
        ) : (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            {orgs.map((org) => (
              <Card key={org.id} size="small" variant="outlined" style={{ background: 'transparent' }}>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label={t('profile.organization')}>
                    {org.organization_name}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('profile.position')}>
                    {org.position ? (
                      <Tag color="geekblue">
                        {positionLabel(org.position)}
                      </Tag>
                    ) : (
                      t('profile.noData')
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('profile.workplace')} span={2}>
                    <MyWorkplaceField
                      memberId={org.id}
                      workplace={org.workplace}
                      onSaved={(workplace) => setOrgs((items) => items.map((item) =>
                        item.id === org.id ? { ...item, workplace } : item,
                      ))}
                    />
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ))}
          </Space>
        )}
      </Card>
      </Space>

      <Modal open={partyEditOpen} title={t('partyProfile.editTitle')} width={420}
        okText={t('common.save')} cancelText={t('common.cancel')} confirmLoading={partySaving}
        onCancel={() => { if (!partySaving) setPartyEditOpen(false) }}
        closable={!partySaving} mask={{ closable: !partySaving }}
        onOk={() => void savePartyInfo()} destroyOnHidden>
        <Form form={partyForm} layout="vertical" autoComplete="off" disabled={partySaving}>
          <Form.Item name="party_no" label={t('partyProfile.fieldMemberNo')}>
            <InputNumber precision={0} min={Number.MIN_SAFE_INTEGER} max={Number.MAX_SAFE_INTEGER}
              style={{ width: '100%' }} placeholder={t('partyProfile.memberNoPlaceholder')} />
          </Form.Item>
          <Form.Item name="join_time" label={t('partyProfile.fieldJoinDate')}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD"
              placeholder={t('partyProfile.joinDatePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 基本信息编辑：仅手机号、邮箱可修改 */}
      <Modal
        open={basicEditOpen}
        title={t('profile.editTitle')}
        width={420}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={basicSaving}
        onCancel={() => setBasicEditOpen(false)}
        onOk={() => void saveBasicInfo()}
        destroyOnHidden
      >
        <Form form={basicForm} layout="vertical" autoComplete="off">
          <Form.Item
            name="phone"
            label={t('profile.phone')}
            rules={[{ max: 32, message: t('profile.phoneTooLong') }]}
          >
            <Input maxLength={32} placeholder={t('profile.phonePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="email"
            label={t('profile.email')}
            rules={[
              { type: 'email', message: t('profile.emailInvalid') },
              { max: 128, message: t('profile.emailTooLong') },
            ]}
          >
            <Input maxLength={128} placeholder={t('profile.emailPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
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
  const positionLabel = usePositionLabel()
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)
  // 已加载的步骤详情：模板 ID → 步骤列表
  const [stepsByTemplate, setStepsByTemplate] = useState<Record<number, ApprovalStep[]>>({})
  // 模板详情中的「加分细则」（模板 description；列表可能未返回，以详情为准）
  const [rulesByTemplate, setRulesByTemplate] = useState<Record<number, string | null>>({})
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
        // 模板详情中的 description 即「加分细则」，与审批流程一并展示
        setRulesByTemplate((prev) => ({
          ...prev,
          [templateId]: detailResult.value.description?.trim() ? detailResult.value.description : null,
        }))
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
          orientation="vertical"
          size="small"
          items={steps.map((step) => {
            const role = step.position
              ? positionLabel(step.position)
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
              content: parts.length > 0 ? <>{parts}</> : undefined,
            }
          })}
        />
        {approverError ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
            title={t('partyProfile.guideApproverError', { reason: approverError })}
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
              <Tag>
                {t('approvalTemplate.fieldOrganization')}：<OrganizationName id={template.organization_id} />
              </Tag>
            </span>
          ),
          children: (
            <div className="party-guide-body">
              {/* 加分细则：优先使用模板详情接口返回的 description（列表可能未返回该字段） */}
              {(() => {
                const rules =
                  template.id in rulesByTemplate
                    ? rulesByTemplate[template.id]
                    : template.description
                return (
                  <div className="party-guide-rules">
                    <div className="party-guide-rules-title">
                      {t('partyProfile.guideRulesTitle')}
                    </div>
                    <p className="party-guide-rules-text">
                      {rules?.trim() ? rules : t('partyProfile.guideRulesNone')}
                    </p>
                  </div>
                )
              })()}
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
  const openApproval = useApprovalNoticeNavigation()
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const [notices, setNotices] = useState<Notice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [createdDates, setCreatedDates] = useState<CreatedDateQuery>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)

  useEffect(() => {
    let cancelled = false
    queryNotices({ ...createdDates, page, page_size: PARTY_NOTICE_PAGE_SIZE })
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
  }, [page, reloadSeq, t, createdDates])

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

  const renderContent = () => {
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
            onClick={() => {
              void handleRead(item)
              void openApproval(item)
            }}
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
              {item.category === 'approval' && <Button type="link" size="small" onClick={(e) => {
                e.stopPropagation()
                void handleRead(item)
                void openApproval(item)
              }}>{t('portal.party_m5')}</Button>}
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
  return <div>
    <div style={{ marginBottom: 16 }}><CreatedDateFilter value={createdDates} onChange={(next) => {
      setPage(1); setCreatedDates(next); setError(null); setLoading(true)
    }} /></div>
    {renderContent()}
  </div>
}

/** PartyProfileView 组件。
 * @returns 类型：Element
 */
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
