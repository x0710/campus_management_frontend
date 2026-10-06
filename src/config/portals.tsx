/** 门户模块配置, 提供门户模块的定义和状态管理，包括图标、颜色、模块列表等 */
/**
 * 每个工作端（学生端、教师端、产品层门户、管理员端）对应一个门户模块。
 * 模块包含图标、主色渐变、主色、规划功能列表（i18n key 后缀 + 状态）。
 */

import {
  ApartmentOutlined,
  AuditOutlined,
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CrownOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  FormOutlined,
  HeartOutlined,
  LineChartOutlined,
  NotificationOutlined,
  ProfileOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SettingOutlined,
  StarOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

/** 四个工作端标识（与后端角色 student/teacher/admin 对齐，leader 为产品层门户） */
export type PortalKey = 'student' | 'teacher' | 'leader' | 'admin'

/**
 * 模块就绪状态：
 * - ready：已接入真实后端接口
 * - preview：前端页面已完成，使用模拟数据可预览，后端接口就绪后替换数据源并改为 ready
 * - pending-api：功能已排期，但后端接口尚不存在（如学生端课表/成绩），接口就绪后直接接入
 * - planned：仅在规划中
 */
export type ModuleStatus = 'ready' | 'preview' | 'pending-api' | 'planned'

export interface PortalModule {
  /** i18n key 后缀，对应 portal.${key} 文案 */
  key: string
  status: ModuleStatus
  /** 菜单图标（@ant-design/icons），侧栏展开/收起态均使用 */
  icon: ReactNode
}

export interface PortalDef {
  key: PortalKey
  /** 卡片图标 */
  icon: ReactNode
  /** 卡片主色渐变（CSS background） */
  gradient: string
  /** 主色（用于边框 hover 光效等） */
  accent: string
  /** 规划功能列表（i18n key 后缀 + 状态） */
  modules: PortalModule[]
}

export const PORTALS: PortalDef[] = [
  {
    key: 'student',
    icon: <ReadOutlined />,
    gradient: 'linear-gradient(135deg, #2f54eb 0%, #597ef7 100%)',
    accent: '#2f54eb',
    modules: [
      { key: 'student_m5', status: 'ready', icon: <UserOutlined /> },
      { key: 'student_m1', status: 'preview', icon: <ScheduleOutlined /> },
      { key: 'student_m2', status: 'ready', icon: <FormOutlined /> },
      { key: 'student_m3', status: 'ready', icon: <TrophyOutlined /> },
      { key: 'student_m4', status: 'ready', icon: <BellOutlined /> },
      { key: 'student_m6', status: 'preview', icon: <HeartOutlined /> },
      { key: 'student_m7', status: 'preview', icon: <StarOutlined /> },
      { key: 'student_m8', status: 'ready', icon: <CalendarOutlined /> },
      { key: 'student_m9', status: 'ready', icon: <WarningOutlined /> },
    ],
  },
  {
    key: 'teacher',
    icon: <ProfileOutlined />,
    gradient: 'linear-gradient(135deg, #0fa968 0%, #36cfc9 100%)',
    accent: '#0fa968',
    modules: [
      { key: 'teacher_m1', status: 'planned', icon: <BookOutlined /> },
      { key: 'teacher_m2', status: 'planned', icon: <CheckCircleOutlined /> },
      { key: 'teacher_m3', status: 'ready', icon: <TeamOutlined /> },
      { key: 'teacher_m4', status: 'planned', icon: <FormOutlined /> },
      { key: 'teacher_m5', status: 'ready', icon: <TrophyOutlined /> },
      { key: 'teacher_m6', status: 'planned', icon: <BellOutlined /> },
      { key: 'teacher_m7', status: 'planned', icon: <CalendarOutlined /> },
      { key: 'teacher_m8', status: 'planned', icon: <CheckCircleOutlined /> },
      { key: 'teacher_m9', status: 'planned', icon: <CalendarOutlined /> },
      { key: 'teacher_m10', status: 'planned', icon: <CheckCircleOutlined /> },
      { key: 'teacher_m11', status: 'planned', icon: <CalendarOutlined /> },
      { key: 'teacher_m12', status: 'planned', icon: <CheckCircleOutlined /> },
      { key: 'teacher_m13', status: 'planned', icon: <CalendarOutlined /> },
      { key: 'teacher_m14', status: 'planned', icon: <CheckCircleOutlined /> },
      { key: 'teacher_m15', status: 'planned', icon: <CalendarOutlined /> },
      { key: 'teacher_m16', status: 'planned', icon: <CheckCircleOutlined /> },
      { key: 'teacher_m17', status: 'planned', icon: <CheckCircleOutlined /> },
    ],
  },
  {
    key: 'leader',
    icon: <CrownOutlined />,
    gradient: 'linear-gradient(135deg, #722ed1 0%, #b37feb 100%)',
    accent: '#722ed1',
    modules: [
      { key: 'leader_m1', status: 'planned', icon: <AuditOutlined /> },
      { key: 'leader_m2', status: 'planned', icon: <LineChartOutlined /> },
      { key: 'leader_m3', status: 'ready', icon: <ApartmentOutlined /> },
      { key: 'leader_m4', status: 'ready', icon: <BellOutlined /> },
      { key: 'leader_m5', status: 'ready', icon: <CalendarOutlined /> },
      { key: 'leader_m6', status: 'ready', icon: <ReadOutlined /> },
      { key: 'leader_m7', status: 'ready', icon: <NotificationOutlined /> },
      { key: 'leader_m8', status: 'ready', icon: <FileDoneOutlined /> },
    ],
  },
  {
    key: 'admin',
    icon: <SettingOutlined />,
    gradient: 'linear-gradient(135deg, #d4380d 0%, #fa8c16 100%)',
    accent: '#d4380d',
    modules: [
      { key: 'admin_m1', status: 'ready', icon: <TeamOutlined /> },
      { key: 'admin_m2', status: 'ready', icon: <SafetyCertificateOutlined /> },
      { key: 'admin_m3', status: 'ready', icon: <ApartmentOutlined /> },
      { key: 'admin_m4', status: 'planned', icon: <FileSearchOutlined /> },
      { key: 'admin_m5', status: 'ready', icon: <AuditOutlined /> },
    ],
  },
]

export function getPortal(key: string | undefined): PortalDef | undefined {
  return PORTALS.find((p) => p.key === key)
}

/**
 * 后端角色 code -> 前端门户 key。
 * 后端 code 统一按小写比较；教师端由 DEPARTMENT_HEAD / COUNSELOR / TECHNICIAN 共用。
 */
const ROLE_TO_PORTAL: Record<string, PortalKey> = {
  super_admin: 'admin',
  admin: 'admin',
  leader: 'leader',
  department_head: 'teacher',
  counselor: 'teacher',
  technician: 'teacher',
  student: 'student',
}

/** 登录自动跳转时按此顺序选择唯一门户，排在前面的优先 */
const ROLE_PORTAL_PRIORITY = Object.keys(ROLE_TO_PORTAL)

/**
 * 根据角色代码获取登录后应进入的门户端。
 * 如果多个角色代码匹配，返回优先级最高的门户端。
 * @param roleCodes 当前用户的角色 code 列表（必填）
 * @returns 对应的 PortalKey；无匹配角色时返回 undefined
 */
export function getPortalKeyByRoleCodes(roleCodes: string[]): PortalKey | undefined {
  const normalized = new Set(roleCodes.map((code) => code.trim().toLowerCase()))
  const matchedRole = ROLE_PORTAL_PRIORITY.find((role) => normalized.has(role))
  return matchedRole ? ROLE_TO_PORTAL[matchedRole] : undefined
}

/**
 * 根据角色代码获取当前用户可访问的全部门户 key。
 * 返回顺序与 PORTALS 定义顺序一致，便于下拉菜单按学生/教师/领导/管理排列。
 * @param roleCodes 当前用户的角色 code 列表（必填）
 * @returns 可访问的 PortalKey 数组；无匹配角色时返回空数组
 */
export function getPortalKeysByRoleCodes(roleCodes: string[]): PortalKey[] {
  const normalized = new Set(roleCodes.map((code) => code.trim().toLowerCase()))
  const allowedPortals = new Set<PortalKey>()
  for (const role of ROLE_PORTAL_PRIORITY) {
    if (normalized.has(role)) {
      allowedPortals.add(ROLE_TO_PORTAL[role])
    }
  }
  return PORTALS.filter((portal) => allowedPortals.has(portal.key)).map((portal) => portal.key)
}

/** 无角色信息时默认进入的门户端：登录后查询不到可匹配角色时，默认进入学生端 */
export const DEFAULT_PORTAL_KEY: PortalKey = 'student'

/**
 * 根据角色代码获取当前用户可访问的门户，无匹配角色时回退为学生端。
 * 与「登录后无角色信息默认进入学生端」保持一致，供登录跳转与顶栏门户菜单共用，
 * 避免出现「已进入学生端、但门户菜单却提示无可用工作端」的不一致。
 * @param roleCodes 当前用户的角色 code 列表（必填）
 * @returns 非空的 PortalKey 数组（必返回）；无匹配角色时返回 [DEFAULT_PORTAL_KEY]
 */
export function getAccessiblePortalKeys(roleCodes: string[]): PortalKey[] {
  const keys = getPortalKeysByRoleCodes(roleCodes)
  return keys.length > 0 ? keys : [DEFAULT_PORTAL_KEY]
}
