import OrganizationName from '../../../components/OrganizationName'
import { isVisibleUserRole } from '../../../config/rbac'
import { useRequestSequence } from '../../../composables/useRequestSequence'
import { usePositionLabel } from '../../../composables/usePositionLabel'
import { BankOutlined, EditOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Avatar,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import axios from 'axios'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { extractErrorReason } from '../../../api/common'
import { listUserOrganizations } from '../../../api/organizations'
import type { UserOrganization } from '../../../api/types/organizations'
import { getPosition } from '../../../api/positions'
import type { PositionDetail } from '../../../api/types/positions'
import { getRole, queryUserRoleRelations } from '../../../api/rbac'
import type { RoleInfo, UserRoleRelation } from '../../../api/types/rbac'
import { createPartyProfile, updatePartyProfile } from '../../../api/partyProfiles'
import type { UserDetail } from '../../../api/types/users'
import { usePartyProfiles } from '../../../composables/usePartyProfiles'
import { usePositionNames } from '../../../composables/usePositionNames'
import { PARTY_POLITICAL_STATUS_NAMES } from '../../../config/partyProfile'
import { type TranslateFn } from '../../../i18n'
import { formatDateOnly, formatDateTime } from '../../../utils/datetime'
import {
  groupUserOrganizationsByOrg,
  uniquePositionCodes,
  uniqueWorkplaces,
} from '../../../utils/userOrganization'
import ErrorState from '../../../components/ErrorState'
import { type EditSection } from '../../admin/UserEditPanel'

/** 党员档案编辑表单值（党员编号 / 入党时间） */
interface PartyProfileFormValues {
  party_no: number | null
  join_time: Dayjs | null
}

/** 组织任职项（含职位详情，职位接口异常时保留原始 code 兜底） */
interface OrgItem extends UserOrganization {
  positionDetail?: PositionDetail
}

const { Text } = Typography

/**
 * 基本信息面板：用户资料 + 党员信息（部分来源）+ 系统角色 + 组织任职（角色/组织在本面板内按需加载）。
 * 党委支部端 / 学院端来源不展示「系统角色」「组织任职」两张卡片（showRoleOrgCards=false），
 * 此时跳过角色请求，组织任职仍加载以供「党员信息」卡片使用。
 */
export default function BasicInfoPanel({
  user,
  loading,
  genderLabel,
  locale,
  t,
  canEdit,
  showPartyInfo,
  showRoleOrgCards,
  reloadSeq,
  onEdit,
}: {
  user: UserDetail | null
  loading: boolean
  genderLabel: string
  locale: 'zh' | 'en'
  t: TranslateFn
  /** 是否展示编辑入口（管理端 / 党委学校端等来源为 true） */
  canEdit: boolean
  /** 是否展示「党员信息」卡片（党委支部端 / 学院端 / 学校端为 true，口径同党员端「我的」） */
  showPartyInfo: boolean
  /** 是否展示「系统角色」「组织任职」两张卡片（党委支部端 / 学院端为 false） */
  showRoleOrgCards: boolean
  /** 角色 / 组织任职重载令牌：保存后自增，强制绕过缓存重新请求最新关联数据（代码要求 25） */
  reloadSeq: number
  /** 打开指定区块的编辑弹窗（复用 admin/UserEditPanel；一次只编辑一个部分） */
  onEdit: (section: EditSection) => void
}) {
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const visibleRoles = roles.filter(isVisibleUserRole)
  const [orgs, setOrgs] = useState<OrgItem[]>([])
  const [extrasLoading, setExtrasLoading] = useState(false)
  const [extrasError, setExtrasError] = useState<string | null>(null)
  const { message } = AntdApp.useApp()
  // 党员档案编辑弹窗：修改党员编号 / 入党时间
  const [partyEditOpen, setPartyEditOpen] = useState(false)
  const [partySaving, setPartySaving] = useState(false)
  const [partyForm] = Form.useForm<PartyProfileFormValues>()
  // 职位详情接口不可用时的兜底映射：编码 → 名称（未命中仍显示编码）
  const positionNames = usePositionNames()
  const positionLabel = usePositionLabel()

  // 仅依赖成员 ID（而非整个 user 对象），避免成员详情重新拉取后因对象引用变化而重复请求
  const memberId = user?.id

  // 党员编号 / 入党时间：展示「党员信息」卡片时按成员 ID 查询党员档案
  const {
    profiles: partyProfiles,
    loading: partyProfilesLoading,
    notFound: partyProfilesNotFound,
    refresh: refreshPartyProfiles,
  } = usePartyProfiles(showPartyInfo && memberId ? [memberId] : [])
  const partyProfile = memberId ? partyProfiles.get(memberId) : undefined
  const partyProfileNotFound = memberId ? partyProfilesNotFound.has(memberId) : false

  /**
   * 并行加载角色关联与组织任职；单个角色/职位详情失败不影响整体。
   * 不展示「系统角色」卡片时跳过角色请求（组织任职仍需加载：党员信息卡片依赖它）。
   * @param force 是否绕过会话缓存强制重新请求（必填否，默认 false；保存后刷新传 true）
   */
  const extrasRequests = useRequestSequence()
  const loadExtras = useCallback(
    async (force?: boolean) => {
      const isCurrent = extrasRequests.begin()
      if (!memberId) return
      setExtrasLoading(true)
      setExtrasError(null)
      try {
        const [relations, userOrgs] = await Promise.all([
          showRoleOrgCards
            ? queryUserRoleRelations(memberId, force)
            : Promise.resolve([] as UserRoleRelation[]),
          listUserOrganizations(memberId, force),
        ])
        if (!isCurrent()) return
        const roleItems = await Promise.all(
          relations.map(async (rel): Promise<RoleInfo | null> => {
            try {
              return await getRole(rel.role_id, force)
            } catch {
              return null
            }
          }),
        )
        if (!isCurrent()) return
        const orgItems = await Promise.all(
          userOrgs.map(async (uo): Promise<OrgItem> => {
            if (!uo.position) return { ...uo }
            try {
              return { ...uo, positionDetail: await getPosition(uo.position, force) }
            } catch {
              return { ...uo }
            }
          }),
        )
        if (!isCurrent()) return
        setRoles(roleItems.filter((r): r is RoleInfo => r !== null))
        setOrgs(orgItems)
      } catch (err) {
        if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
          setExtrasError(extractErrorReason(err, t))
        }
      } finally {
        if (isCurrent()) setExtrasLoading(false)
      }
    },
    [memberId, t, showRoleOrgCards, extrasRequests],
  )

  useEffect(() => {
    // 首次加载可命中会话缓存；保存后 reloadSeq 变化时强制重查，确保立即展示最新角色/任职
    void loadExtras(reloadSeq > 0)
    return () => extrasRequests.invalidate()
  }, [loadExtras, reloadSeq, extrasRequests])

  /** 打开党员档案编辑弹窗：回填现有党员编号 / 入党时间 */
  const openPartyProfileEdit = () => {
    const joinTime = partyProfile?.join_time?.trim()
      ? dayjs(partyProfile.join_time)
      : null
    partyForm.setFieldsValue({
      party_no: partyProfile?.party_no ?? null,
      join_time: joinTime?.isValid() ? joinTime : null,
    })
    setPartyEditOpen(true)
  }

  /** 保存党员档案：已有档案走 PATCH，无档案走 POST 创建 */
  const savePartyProfile = async () => {
    if (!memberId) return
    let values: PartyProfileFormValues
    try {
      values = await partyForm.validateFields()
    } catch {
      return
    }
    setPartySaving(true)
    try {
      const body = {
        party_no:
          values.party_no == null || Number.isNaN(values.party_no)
            ? null
            : Number(values.party_no),
        join_time: values.join_time
          ? values.join_time.format('YYYY-MM-DD')
          : null,
      }
      if (partyProfile) {
        await updatePartyProfile(memberId, body)
      } else {
        await createPartyProfile({ user_id: memberId, ...body })
      }
      message.success(t('partyProfile.saveSuccess'))
      setPartyEditOpen(false)
      // 保存后重新查询党员档案，卡片立即展示最新值
      refreshPartyProfiles()
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        message.error(extractErrorReason(err, t))
      }
    } finally {
      setPartySaving(false)
    }
  }

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />
  if (!user) return <Alert type="info" showIcon title={t('memberDetail.loadUserFailed')} />

  // 党员信息（党委支部端 / 学院端 / 学校端）：展示口径与党员端「我的」页一致。
  // 所属支部取第一项任职组织；政治面貌取任职职位名中的党员身份（书记等其他职位忽略）；
  // 党员编号 / 入党时间取 GET /api/party/profiles。
  const positionNameOf = (uo: OrgItem): string =>
    (uo.positionDetail?.name ?? (uo.position ? positionNames.get(uo.position) : '') ?? '').trim()
  const partyBranch =
    orgs.map((uo) => uo.organization_name?.trim() ?? '').find((name) => name.length > 0) ??
    t('common.noData')
  const politicalStatus = orgs
    .map(positionNameOf)
    .find((name) => PARTY_POLITICAL_STATUS_NAMES.includes(name))

  // 组织任职卡片按组织合并：同一组织有多个职位时只展示一张卡片，职位栏并列展示全部职位
  const orgGroups = groupUserOrganizationsByOrg(orgs)

  return (
    <>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {/* 具备用户管理权限的来源（管理端 / 党委学校端）提供三个独立编辑入口：
          基本信息（资料卡片上方工具栏）、系统角色与组织任职（各自卡片右上角） */}
      {canEdit && (
        <div className="approval-toolbar approval-toolbar-right">
          <Tooltip title={t('memberDetail.editBasicHint')}>
            <Button type="primary" icon={<EditOutlined />} onClick={() => onEdit('profile')}>
              {t('memberDetail.editBasic')}
            </Button>
          </Tooltip>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'stretch',
          width: '100%',
        }}
      >
        {/* 头像（avatar 为图片地址），与党员端「我的」/ 学生端个人信息展示一致 */}
        <Card size="small" title={t('profile.avatar')} style={{ flex: '0 0 168px' }}>
          {user.avatar && user.avatar.trim() ? (
            <Avatar shape="square" size={96} src={user.avatar} />
          ) : (
            <Avatar shape="square" size={96} icon={<UserOutlined />} />
          )}
        </Card>
        <Card
          size="small"
          title={t('profile.basicInfo')}
          style={{ flex: '1 1 480px', minWidth: 0 }}
        >
          <Descriptions
            bordered
            size="small"
            column={2}
            items={[
              { key: 'uid', label: t('memberDetail.fieldUid'), children: user.id },
              { key: 'name', label: t('profile.name'), children: user.name ?? t('profile.noData') },
              { key: 'gender', label: t('profile.gender'), children: genderLabel },
              {
                key: 'email',
                label: t('profile.email'),
                children: user.email ?? t('profile.noData'),
              },
              {
                key: 'phone',
                label: t('profile.phone'),
                children: user.phone ?? t('profile.noData'),
              },
              {
                key: 'birthday',
                label: t('profile.birthday'),
                children: user.birthday ? formatDateOnly(user.birthday) : t('profile.noData'),
              },
              {
                key: 'created_at',
                label: t('profile.createdAt'),
                children: formatDateTime(user.created_at, locale),
              },
              {
                key: 'updated_at',
                label: t('memberDetail.fieldUpdatedAt'),
                children: formatDateTime(user.updated_at, locale),
              },
            ]}
          />
        </Card>
      </div>

      {/* 党员信息（党委支部端 / 学院端 / 学校端）：与党员端「我的」页展示一致的党员端扩展信息 */}
      {showPartyInfo && (
        <Card
          size="small"
          title={t('partyProfile.partyInfoTitle')}
          extra={
            <Tooltip title={t('partyProfile.editHint')}>
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                disabled={partyProfilesLoading}
                onClick={openPartyProfileEdit}
              >
                {t('partyProfile.edit')}
              </Button>
            </Tooltip>
          }
        >
          {extrasLoading || partyProfilesLoading ? (
            <Skeleton active paragraph={{ rows: 1 }} />
          ) : (
            <Descriptions
              bordered
              size="small"
              column={2}
              items={[
                {
                  key: 'member_no',
                  label: t('partyProfile.fieldMemberNo'),
                  children: partyProfileNotFound
                    ? t('common.notFound')
                    : partyProfile?.party_no != null
                      ? String(partyProfile.party_no)
                      : t('common.noData'),
                },
                {
                  key: 'branch',
                  label: t('partyProfile.fieldBranch'),
                  children: partyBranch,
                },
                {
                  key: 'political_status',
                  label: t('partyProfile.fieldPoliticalStatus'),
                  children: politicalStatus ?? t('partyProfile.politicalNotFound'),
                },
                {
                  key: 'join_date',
                  label: t('partyProfile.fieldJoinDate'),
                  children: partyProfileNotFound
                    ? t('common.notFound')
                    : partyProfile?.join_time?.trim()
                      ? formatDateOnly(partyProfile.join_time)
                      : t('common.noData'),
                },
              ]}
            />
          )}
        </Card>
      )}

      {/* 系统角色 / 组织任职：党委支部端 / 学院端不展示（见 MEMBER_DETAIL_HIDDEN_ROLE_ORG_FROM_MODULES） */}
      {showRoleOrgCards && (
        <>
          {/* 系统角色（编辑入口置于卡片右上角） */}
          <Card
            size="small"
            title={
              <Space>
                <TeamOutlined />
                {t('profile.rolesTitle')}
              </Space>
            }
            extra={
              canEdit ? (
                <Tooltip title={t('memberDetail.editRolesHint')}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => onEdit('roles')}
                  >
                    {t('memberDetail.editRoles')}
                  </Button>
                </Tooltip>
              ) : undefined
            }
          >
            {extrasError ? (
              <ErrorState message={extrasError} />
            ) : extrasLoading ? (
              <Skeleton active paragraph={{ rows: 1 }} />
            ) : visibleRoles.length === 0 ? (
              <Text type="secondary">{t('profile.noData')}</Text>
            ) : (
              <Space size={[8, 8]} wrap>
                {visibleRoles.map((role) => (
                  <Tag key={role.id} color="blue">
                    {role.name}
                    {role.description ? (
                      <Text type="secondary" style={{ marginLeft: 4 }}>
                        ({role.description})
                      </Text>
                    ) : null}
                  </Tag>
                ))}
              </Space>
            )}
          </Card>

          {/* 组织任职（组织 + 职位 + 工作地点；编辑入口置于卡片右上角） */}
          <Card
            size="small"
            title={
              <Space>
                <BankOutlined />
                {t('profile.orgsTitle')}
              </Space>
            }
            extra={
              canEdit ? (
                <Tooltip title={t('memberDetail.editOrgsHint')}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => onEdit('organizations')}
                  >
                    {t('memberDetail.editOrgs')}
                  </Button>
                </Tooltip>
              ) : undefined
            }
          >
            {extrasError ? (
              <ErrorState message={extrasError} />
            ) : extrasLoading ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : orgGroups.length === 0 ? (
              <Text type="secondary">{t('profile.noData')}</Text>
            ) : (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                {orgGroups.map((group) => {
                  // 同一组织可能有多个职位记录：按职位编码去重后并列展示，工作地点同样去重合并
                  const positionCodes = uniquePositionCodes(group.items)
                  const workplaces = uniqueWorkplaces(group.items)
                  return (
                    <Card
                      key={group.organization_id}
                      size="small"
                      variant="outlined"
                      style={{ background: 'transparent' }}
                    >
                      <Descriptions
                        column={2}
                        size="small"
                        items={[
                          {
                            key: 'organization',
                            label: t('profile.organization'),
                            children: <OrganizationName id={group.organization_id} fallbackName={group.organization_name} />,
                          },
                          {
                            key: 'position',
                            label: t('profile.position'),
                            children:
                              positionCodes.length > 0 ? (
                                <Space wrap size={[12, 4]}>
                                  {positionCodes.map((code) => {
                                    const detail = group.items.find(
                                      (item) => item.position === code,
                                    )?.positionDetail
                                    return (
                                      <Space key={code} size={4}>
                                        <Tag color={detail ? 'geekblue' : 'default'}>
                                          {positionLabel(code, detail?.name)}
                                        </Tag>
                                        {detail?.description ? (
                                          <Text type="secondary" style={{ marginLeft: 4 }}>
                                            {detail.description}
                                          </Text>
                                        ) : null}
                                      </Space>
                                    )
                                  })}
                                </Space>
                              ) : (
                                t('profile.noData')
                              ),
                          },
                          {
                            key: 'workplace',
                            label: t('profile.workplace'),
                            span: 2,
                            children:
                              workplaces.length > 0
                                ? workplaces.join('、')
                                : t('profile.noData'),
                          },
                        ]}
                      />
                    </Card>
                  )
                })}
              </Space>
            )}
          </Card>
        </>
      )}
      </Space>

      {/* 党员档案编辑：仅党委支部端 / 学院端 / 学校端的党员信息卡片展示入口 */}
      <Modal
        open={partyEditOpen}
        title={t('partyProfile.editTitle')}
        width={420}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={partySaving}
        onCancel={() => setPartyEditOpen(false)}
        onOk={() => void savePartyProfile()}
        destroyOnHidden
      >
        <Form form={partyForm} layout="vertical" autoComplete="off">
          <Form.Item name="party_no" label={t('partyProfile.fieldMemberNo')}>
            <InputNumber
              precision={0}
              style={{ width: '100%' }}
              placeholder={t('partyProfile.memberNoPlaceholder')}
            />
          </Form.Item>
          <Form.Item name="join_time" label={t('partyProfile.fieldJoinDate')}>
            <DatePicker
              style={{ width: '100%' }}
              format={locale === 'zh' ? 'YYYY年MM月DD日' : 'YYYY-MM-DD'}
              placeholder={t('partyProfile.joinDatePlaceholder')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
