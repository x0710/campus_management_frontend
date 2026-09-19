/**
 * 门户模块路由：作为 PortalWorkspace 布局的子路由出口，
 * 根据 URL 中的 portalKey 与 moduleKey 渲染对应已开通模块的视图。
 * - 无 moduleKey 或 moduleKey 非法时跳转到该门户的第一个已开通模块，避免历史栈残留无效地址；
 * - 该门户没有任何已开通模块时渲染占位页（WorkspacePlaceholder）。
 * 顶栏 + 侧栏由父布局 PortalWorkspace 提供，本组件只负责内容区。
 */
import { ApiOutlined, AppstoreAddOutlined, LockOutlined } from '@ant-design/icons'
import { Navigate, useParams } from 'react-router'
import type { ComponentType } from 'react'
import { Tag } from 'antd'
import { getPortal, type PortalKey, type PortalModule } from '../../config/portals'
import { useT } from '../../i18n'
import AnnouncementsView from './AnnouncementsView'
import LeaveApplyView from '../student/LeaveApplyView'
import StudentProfileView from '../student/StudentProfileView'
import SchoolCalendarView from '../student/SchoolCalendarView'
import ScheduleView from '../student/ScheduleView'
import GradesView from '../student/GradesView'
import CounselingBookingView from '../student/CounselingBookingView'
import SecondClassCreditsView from '../student/SecondClassCreditsView'
import LeaveApprovalView from '../teacher/LeaveApprovalView'
import StudentScoresView from '../teacher/StudentScoresView'
import PublishAnnouncementView from '../leader/PublishAnnouncementView'
import CalendarManageView from '../leader/CalendarManageView'
import CourseManageView from '../leader/CourseManageView'
import LeaderOrgView from '../leader/LeaderOrgView'
import UsersAdminView from '../admin/UsersAdminView'
import OrgAdminView from '../admin/OrgAdminView'
import RolesAdminView from '../admin/RolesAdminView'
import PositionsAdminView from '../admin/PositionsAdminView'

/**
 * 模块视图注册表。
 * key 形如 `${portalKey}:${moduleKey}`；
 * ready 模块接真实接口，preview 模块为模拟数据预览页，接口就绪后替换数据源即可。
 */
const MODULE_VIEWS: Partial<Record<`${PortalKey}:${string}`, ComponentType>> = {
  'student:student_m1': ScheduleView,
  'student:student_m2': LeaveApplyView,
  'student:student_m3': GradesView,
  'student:student_m4': AnnouncementsView,
  'student:student_m5': StudentProfileView,
  'student:student_m6': CounselingBookingView,
  'student:student_m7': SecondClassCreditsView,
  'student:student_m8': SchoolCalendarView,
  'teacher:teacher_m2': LeaveApprovalView,
  'teacher:teacher_m5': StudentScoresView,
  'leader:leader_m3': LeaderOrgView,
  'leader:leader_m4': PublishAnnouncementView,
  'leader:leader_m5': CalendarManageView,
  'leader:leader_m6': CourseManageView,
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
    return <Navigate to="/home" replace />
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
