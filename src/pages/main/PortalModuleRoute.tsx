/**
 * 门户模块路由：作为 PortalWorkspace 布局的子路由出口，
 * 根据 URL 中的 portalKey 与 moduleKey 渲染对应已开通模块的视图。
 * - 无 moduleKey 或 moduleKey 非法时跳转到该门户的第一个已开通模块，避免历史栈残留无效地址；
 * - 该门户没有任何已开通模块时渲染占位页（WorkspacePlaceholder）。
 * 顶栏 + 侧栏由父布局 PortalWorkspace 提供，本组件只负责内容区。
 */
import { ApiOutlined, AppstoreAddOutlined, LockOutlined } from '@ant-design/icons'
import { Navigate, useParams } from 'react-router'
import { lazy, type ComponentType } from 'react'
import { Tag } from 'antd'
import { getPortal, type PortalKey, type PortalModule } from '../../config/portals'
import { useT } from '../../i18n'
const AnnouncementsView = lazy(() => import('./AnnouncementsView'))
const LeaveApplyView = lazy(() => import('../student/LeaveApplyView'))
const StudentProfileView = lazy(() => import('../student/StudentProfileView'))
const SchoolCalendarView = lazy(() => import('../student/SchoolCalendarView'))
const ScheduleView = lazy(() => import('../student/ScheduleView'))
const GradesView = lazy(() => import('../student/GradesView'))
const CounselingBookingView = lazy(() => import('../student/CounselingBookingView'))
const SecondClassCreditsView = lazy(() => import('../student/SecondClassCreditsView'))
const ViolationQueryView = lazy(() => import('../student/ViolationQueryView'))
const LeaveApprovalView = lazy(() => import('../teacher/LeaveApprovalView'))
const StudentScoresView = lazy(() => import('../teacher/StudentScoresView'))
const ClassManageView = lazy(() => import('../teacher/ClassManageView'))
const PublishAnnouncementView = lazy(() => import('../leader/PublishAnnouncementView'))
const CalendarManageView = lazy(() => import('../leader/CalendarManageView'))
const CourseManageView = lazy(() => import('../leader/CourseManageView'))
const ApprovalTemplateManageView = lazy(() => import('../leader/ApprovalTemplateManageView'))
const LeaderOrgView = lazy(() => import('../leader/LeaderOrgView'))
const RewardingManageView = lazy(() => import('../leader/RewardingManageView'))
const UsersAdminView = lazy(() => import('../admin/UsersAdminView'))
const OrgAdminView = lazy(() => import('../admin/OrgAdminView'))
const RolesAdminView = lazy(() => import('../admin/RolesAdminView'))
const PositionsAdminView = lazy(() => import('../admin/PositionsAdminView'))
const PartyHomeView = lazy(() => import('../party/PartyHomeView'))
const PartyDeclarationView = lazy(() => import('../party/PartyDeclarationView'))
const PartyImprovementView = lazy(() => import('../party/PartyImprovementView'))
const PartyProfileView = lazy(() => import('../party/PartyProfileView'))
const PartyScoreApprovalView = lazy(() => import('../party/PartyScoreApprovalView'))
const BranchWorkbenchView = lazy(() => import('../branch/BranchWorkbenchView'))
const BranchManageView = lazy(() => import('../branch/BranchManageView'))
const AcademyWorkbenchView = lazy(() => import('../academy/AcademyWorkbenchView'))
const AcademyMetricsView = lazy(() => import('../academy/AcademyMetricsView'))
const SchoolOverviewView = lazy(() => import('../school/SchoolOverviewView'))

/**
 * （可查看全部公告、删除任意公告，编辑仅限本人发布的公告）。
 * 提取为模块级常量，保证组件引用稳定，避免每次渲染都重新挂载列表。
 */
const LeaderAnnouncementManageView = () => <AnnouncementsView manage />

/**
 * 党委学校端「组织管理」：复用管理端组织架构页面（组织树 + 组织 CRUD + 成员任职管理），
 * 接真实组织/成员接口；用独立 uiKey 隔离选中态，避免与管理端串用。
 */
const SchoolOrgAdminView = () => <OrgAdminView uiKey="school_m2" />

/**
 * 党委支部端「支部管理」：按组织树深度判定当前用户所属支部后展示其成员
 * （支部还有下级支部时展示「支部 + 全部下级」组织树）。
 */
const BranchManageModule = () => <BranchManageView fromModuleKey="branch_m5" />

/**
 * 党委学院端「学院支部管理」：与支部端使用同一套支部判定与组织树显隐逻辑，
 * 仅侧栏高亮/详情页返回来源不同。
 */
const AcademyBranchManageModule = () => <BranchManageView fromModuleKey="academy_m5" />

/**
 * 模块视图注册表。
 * key 形如 `${portalKey}:${moduleKey}`；
 * ready 模块接真实接口，preview 模块为模拟数据预览页，接口就绪后替换数据源即可。
 */
const MODULE_VIEWS: Partial<Record<`${PortalKey}:${string}`, ComponentType>> = {
  'party:party_m1': PartyHomeView,
  'party:party_m2': PartyDeclarationView,
  'party:party_m3': PartyImprovementView,
  'party:party_m4': PartyProfileView,
  'branch:branch_m1': BranchWorkbenchView,
  // 党委支部端「审核管理」：党建活动加分审批（步骤列表前端合成 + PUT 通过/驳回/转交）
  'branch:branch_m3': PartyScoreApprovalView,
  // 党委支部端「我的」：与党员端「我的」复用同一页面
  'branch:branch_m4': PartyProfileView,
  // 党委支部端「支部管理」：判定所属支部后展示其成员（有下级支部则展示组织树）
  'branch:branch_m5': BranchManageModule,
  'academy:academy_m1': AcademyWorkbenchView,
  'academy:academy_m2': AcademyMetricsView,
  // 党委学院端「审核管理」：党建活动加分审批
  'academy:academy_m3': PartyScoreApprovalView,
  // 党委学院端「我的」：与党员端「我的」复用同一页面
  'academy:academy_m4': PartyProfileView,
  // 党委学院端「学院支部管理」：与支部端同一支部判定逻辑（所属支部 + 下级组织成员）
  'academy:academy_m5': AcademyBranchManageModule,
  'school:school_m1': SchoolOverviewView,
  // 党委学校端「组织管理」：复用管理端「组织架构」页面（接真实组织/成员接口）
  'school:school_m2': SchoolOrgAdminView,
  // 党委学校端「系统权限管理」：与管理端「角色权限」复用同一页面（接真实 RBAC 接口）
  'school:school_m3': RolesAdminView,
  // 党委学校端「审批管理」：党建活动加分审批
  'school:school_m4': PartyScoreApprovalView,
  'student:student_m1': ScheduleView,
  'student:student_m2': LeaveApplyView,
  'student:student_m3': GradesView,
  'student:student_m4': AnnouncementsView,
  'student:student_m5': StudentProfileView,
  'student:student_m6': CounselingBookingView,
  'student:student_m7': SecondClassCreditsView,
  'student:student_m8': SchoolCalendarView,
  'student:student_m9': ViolationQueryView,
  'teacher:teacher_m2': LeaveApprovalView,
  'teacher:teacher_m3': ClassManageView,
  'teacher:teacher_m5': StudentScoresView,
  'leader:leader_m3': LeaderOrgView,
  'leader:leader_m4': PublishAnnouncementView,
  'leader:leader_m5': CalendarManageView,
  'leader:leader_m6': CourseManageView,
  'leader:leader_m7': LeaderAnnouncementManageView,
  'leader:leader_m8': ApprovalTemplateManageView,
  'leader:leader_m9': RewardingManageView,
  'admin:admin_m1': UsersAdminView,
  'admin:admin_m2': RolesAdminView,
  'admin:admin_m3': OrgAdminView,
  'admin:admin_m5': PositionsAdminView,
}

export default function PortalModuleRoute() {
  const { portalKey, moduleKey } = useParams<{
    portalKey: string
    moduleKey?: string
  }>()
  const portal = getPortal(portalKey)

  if (!portal) {
    return <Navigate to="/" replace />
  }

  const readyModules = portal.modules.filter((m) => m.status === 'ready')
  const previewModules = portal.modules.filter((m) => m.status === 'preview')
  const pendingModules = portal.modules.filter((m) => m.status === 'pending-api')
  const plannedModules = portal.modules.filter((m) => m.status === 'planned')
  // 可访问模块 = 已开通（ready）+ 预览中（preview，模拟数据）
  const accessibleModules = [...readyModules, ...previewModules]
  const defaultModuleKey = accessibleModules[0]?.key

  // 缺省或非法 moduleKey 时 replace 到第一个可访问模块，避免历史栈残留无效地址
  if (
    defaultModuleKey &&
    (moduleKey === undefined || !accessibleModules.some((m) => m.key === moduleKey))
  ) {
    return <Navigate to={`/portal/${portal.key}/${defaultModuleKey}`} replace />
  }

  // 有效 moduleKey：渲染对应模块视图
  if (moduleKey && accessibleModules.some((m) => m.key === moduleKey)) {
    const ActiveView = MODULE_VIEWS[`${portal.key}:${moduleKey}`]
    if (ActiveView) {
      return <ActiveView />
    }
  }

  // 没有任何已开通模块：渲染占位页
  return (
    <WorkspacePlaceholder
      name={portal.key}
      pending={pendingModules}
      planned={plannedModules}
    />
  )
}

/** 没有任何已开通模块时的占位页（与原 PortalWorkspace 行为一致） */
function WorkspacePlaceholder({
  name,
  pending,
  planned,
}: {
  name: string
  pending: PortalModule[]
  planned: PortalModule[]
}) {
  const t = useT()
  const displayName = t(`portal.${name}_name`)

  return (
    <div className="workspace-placeholder">
      <div className="workspace-placeholder-icon">
        <AppstoreAddOutlined />
      </div>
      <div className="workspace-placeholder-title">{t('portal.emptyTitle')}</div>
      <p className="workspace-placeholder-desc">
        {t('portal.emptyDesc', { name: displayName })}
      </p>

      {pending.length > 0 && (
        <section className="workspace-module-group">
          <div className="workspace-module-group-title">
            <ApiOutlined />
            {t('portal.groupApiPending')}
          </div>
          <p className="workspace-module-group-hint">{t('portal.apiPendingDesc')}</p>
          <div className="workspace-placeholder-modules">
            {pending.map((m) => (
              <Tag key={m.key} color="orange" className="workspace-placeholder-tag">
                {t(`portal.${m.key}`)}
              </Tag>
            ))}
          </div>
        </section>
      )}

      {planned.length > 0 && (
        <section className="workspace-module-group">
          <div className="workspace-module-group-title">
            <LockOutlined />
            {t('portal.groupPlanned')}
          </div>
          <div className="workspace-placeholder-modules">
            {planned.map((m) => (
              <Tag key={m.key} className="workspace-placeholder-tag">
                {t(`portal.${m.key}`)}
              </Tag>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
