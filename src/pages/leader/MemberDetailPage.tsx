/** 共享成员详情入口：处理来源、导航和编辑刷新；各业务页签位于 member-detail/。 */
import BasicInfoPanel from './member-detail/BasicInfoPanel'
import ProfileDetailTab from './member-detail/ProfileDetailTab'
import GradesTab from './member-detail/GradesTab'
import PartyScoreTab from './member-detail/PartyScoreTab'
import LeaveTab from './member-detail/LeaveTab'
import RewardingTab from './member-detail/RewardingTab'
import ViolationTab from './member-detail/ViolationTab'
import { useRequestSequence } from '../../composables/useRequestSequence'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Modal, Skeleton, Tabs, Tooltip } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { extractErrorReason } from '../../api/common'
import { listAllOrganizations } from '../../api/organizations'
import type { OrganizationInfo } from '../../api/types/organizations'
import { queryRoles } from '../../api/rbac'
import type { RoleInfo } from '../../api/types/rbac'
import { getUser } from '../../api/users'
import type { UserDetail } from '../../api/types/users'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import {
  MEMBER_DETAIL_BASIC_EDIT_FROM_MODULES,
  MEMBER_DETAIL_HIDDEN_EXTRA_TABS_FROM_MODULES,
  MEMBER_DETAIL_HIDDEN_ROLE_ORG_FROM_MODULES,
  MEMBER_DETAIL_PARTY_SCORE_FROM_MODULES,
  MEMBER_DETAIL_READONLY_FROM_MODULES,
} from '../../config/leaderOrg'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { normalizeGender } from '../../utils/gender'
import ErrorState from '../../components/ErrorState'
import UserEditPanel, { type EditSection } from '../admin/UserEditPanel'

/** 共享成员详情页：6 个 Tab 汇总成员基本信息、详细信息、成绩、请假、违规与奖助信息 */
export default function MemberDetailPage() {
  const { uid, portalKey } = useParams()
  const [params] = useSearchParams()
  // 成员或来源变化时重建全部页签，避免带入上个成员的表单和关联数据。
  return <MemberDetailContent key={`${portalKey}:${uid}:${params.get('from')}`} />
}

function MemberDetailContent() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const reportError = useErrorFeedback()
  const navigate = useNavigate()
  const { portalKey, uid } = useParams<{ portalKey: string; uid: string }>()
  const [searchParams] = useSearchParams()
  // 来源模块（侧栏高亮 + 返回目标）：领导端组织概览 leader_m3 / 老师端班级管理 teacher_m3 /
  // 支部端 branch_m5 / 学院端 academy_m5 / 管理端 admin_m3 / 党委学校端 school_m2
  const fromModuleKey = searchParams.get('from') ?? 'leader_m3'
  // 只读来源（如老师端班级管理）隐藏成绩/违规编辑入口，避免无权限操作（错误处理只作兜底）
  const readOnly = MEMBER_DETAIL_READONLY_FROM_MODULES.includes(fromModuleKey)
  // 可编辑成员资料的来源（管理端 / 党委学校端）在「基本信息」页展示编辑入口
  const canEditBasic = MEMBER_DETAIL_BASIC_EDIT_FROM_MODULES.includes(fromModuleKey)
  // 支部端 / 学院端 / 学校端的组织管理不需要请假、违规与奖助信息
  const hideExtraTabs = MEMBER_DETAIL_HIDDEN_EXTRA_TABS_FROM_MODULES.includes(fromModuleKey)
  // 支部端 / 学院端 / 学校端：不展示「详细信息」，并把「成绩信息」替换为
  // 「获得加分总数（基础分 70 + 党建活动加分）+ 该成员全部加分申请」
  const partyScoreView = MEMBER_DETAIL_PARTY_SCORE_FROM_MODULES.includes(fromModuleKey)
  // 支部端 / 学院端：基本信息不再展示「系统角色」「组织任职」两块卡片
  const hideRoleOrgCards = MEMBER_DETAIL_HIDDEN_ROLE_ORG_FROM_MODULES.includes(fromModuleKey)
  const userId = Number(uid)

  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 成员详情重载令牌：编辑保存后 seq+1 且 force=true，强制绕过会话缓存重新请求最新资料
  const [basicReload, setBasicReload] = useState<{ seq: number; force: boolean }>({
    seq: 0,
    force: false,
  })
  // 基本信息面板内角色 / 组织任职的重载令牌：编辑保存后自增，强制重新请求最新关联数据
  const [extrasReloadSeq, setExtrasReloadSeq] = useState(0)

  // 成员信息编辑弹窗（复用 admin/UserEditPanel）：null 表示关闭
  // 资料 / 系统角色 / 组织任职拆成三个独立入口，一个弹窗只编辑一个部分（每次打开时按区块重新挂载）
  const [editSection, setEditSection] = useState<EditSection | null>(null)
  const [editRefs, setEditRefs] = useState<{
    roles: RoleInfo[]
    organizations: OrganizationInfo[]
  } | null>(null)

  /**
   * 拉取成员详情。
   * @param force 是否绕过会话缓存强制重新请求（必填否，默认 false；编辑保存后传 true）
   */
  const userRequests = useRequestSequence()
  const loadUser = useCallback(
    async (force?: boolean) => {
      const isCurrent = userRequests.begin()
      if (!Number.isFinite(userId) || userId <= 0) {
        setError(t('common.loadFailed'))
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const result = await getUser(userId, force)
        if (isCurrent()) setUser(result)
      } catch (err) {
        if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
          setError(extractErrorReason(err, t))
        }
      } finally {
        if (isCurrent()) setLoading(false)
      }
    },
    [userId, t, userRequests],
  )

  useEffect(() => {
    void loadUser(basicReload.force)
    return () => userRequests.invalidate()
  }, [loadUser, basicReload.seq, basicReload.force, userRequests])

  // 打开指定区块的编辑弹窗：首次打开时并行拉取角色/职位/组织选项（均走会话缓存），失败仅提示不阻塞
  const openEdit = useCallback(
    async (section: EditSection) => {
      setEditSection(section)
      if (editRefs) return
      try {
        const [roleRes, orgList] = await Promise.all([
          queryRoles({ page: 1, page_size: 100 }),
          listAllOrganizations(),
        ])
        setEditRefs({
          roles: roleRes.data,
          organizations: orgList,
        })
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          reportError(err)
          setEditSection(null)
        }
      }
    },
    [editRefs, reportError],
  )

  /**
   * 成员资料 / 系统角色 / 组织任职保存成功后的统一刷新：
   * 强制重新请求成员详情，并使基本信息面板强制重查角色与组织任职，
   * 确保保存后立即展示最新数据，无需用户手动刷新（代码要求 25）。
   */
  const handleChanged = useCallback(() => {
    setBasicReload((r) => ({ seq: r.seq + 1, force: true }))
    setExtrasReloadSeq((s) => s + 1)
  }, [])

  const backToList = () => navigate(`/portal/${portalKey}/${fromModuleKey}`)

  /** 性别文案（与个人资料页一致） */
  const genderLabel = useMemo(() => {
    switch (normalizeGender(user?.gender)) {
      case 'male':
        return t('profile.male')
      case 'female':
        return t('profile.female')
      default:
        return t('profile.unknown')
    }
  }, [user, t])

  return (
    // 数据展示页固定布局：成员标题/返回固定，仅各 Tab 数据区在卡片体内滚动（代码要求 23）
    <div className="data-page-view">
      <section className="panel-card" style={{ width: '100%' }}>
      <header className="panel-card-header">
        <h3 className="panel-card-title">
          {t('memberDetail.title')} · {user?.name ?? `#${userId}`}
        </h3>
        <Tooltip title={t('memberDetail.back')}>
          <Button icon={<ArrowLeftOutlined />} onClick={backToList}>
            {t('memberDetail.back')}
          </Button>
        </Tooltip>
      </header>
      <div className="panel-card-body">
        {error ? (
          <ErrorState message={error} onRetry={() => void loadUser(true)} />
        ) : (
          <Tabs
            items={[
              {
                key: 'basic',
                label: t('memberDetail.tabBasic'),
                children: (
                  <BasicInfoPanel
                    user={user}
                    loading={loading}
                    genderLabel={genderLabel}
                    locale={locale}
                    t={t}
                    canEdit={canEditBasic}
                    showPartyInfo={partyScoreView}
                    showRoleOrgCards={!hideRoleOrgCards}
                    reloadSeq={extrasReloadSeq}
                    onEdit={(section) => void openEdit(section)}
                  />
                ),
              },
              ...(partyScoreView
                ? []
                : [
                    {
                      key: 'profile',
                      label: t('memberDetail.tabProfile'),
                      children: (
                        <ProfileDetailTab uid={userId} locale={locale} t={t} readOnly={readOnly} />
                      ),
                    },
                  ]),
              {
                key: 'grades',
                label: partyScoreView
                  ? t('memberDetail.tabPartyScoreTotal')
                  : t('memberDetail.tabGrades'),
                children: partyScoreView ? (
                  <PartyScoreTab uid={userId} locale={locale} t={t} />
                ) : (
                  <GradesTab uid={userId} t={t} readOnly={readOnly} />
                ),
              },
              ...(hideExtraTabs
                ? []
                : [
                    {
                      key: 'leave',
                      label: t('memberDetail.tabLeave'),
                      children: <LeaveTab uid={userId} t={t} />,
                    },
                    {
                      key: 'violation',
                      label: t('memberDetail.tabViolation'),
                      children: <ViolationTab uid={userId} t={t} readOnly={readOnly} />,
                    },
                    {
                      key: 'rewarding',
                      label: t('memberDetail.tabRewarding'),
                      children: (
                        <RewardingTab uid={userId} t={t} locale={locale} readOnly={readOnly} />
                      ),
                    },
                  ]),
            ]}
          />
        )}
      </div>

      {/* 成员信息编辑（管理端用户与账户 / 组织架构、党委学校端等具备用户管理权限的来源）：
          复用 admin/UserEditPanel，资料 / 系统角色 / 组织任职三个区块各自独立入口，一个弹窗只编辑一个部分 */}
      <Modal
        open={editSection !== null}
        title={
          editSection === 'profile'
            ? t('memberDetail.editBasicTitle', { name: user?.name ?? `#${userId}` })
            : editSection === 'roles'
              ? t('memberDetail.editRolesTitle', { name: user?.name ?? `#${userId}` })
              : t('memberDetail.editOrgsTitle', { name: user?.name ?? `#${userId}` })
        }
        width={editSection === 'roles' ? 560 : 720}
        footer={null}
        onCancel={() => setEditSection(null)}
        destroyOnHidden
      >
        {editRefs ? (
          <UserEditPanel
            uid={userId}
            roles={editRefs.roles}
            organizations={editRefs.organizations}
            section={editSection ?? undefined}
            // 任一区块保存后强制刷新成员资料、系统角色与组织任职展示（代码要求 25）
            onChanged={handleChanged}
          />
        ) : (
          <Skeleton active paragraph={{ rows: 6 }} />
        )}
      </Modal>
      </section>
    </div>
  )
}
