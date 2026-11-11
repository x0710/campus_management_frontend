import { resolveDefaultPartyPortalKey, getAccessiblePartyPortalKeys } from './partyPortalPositions'
/** 门户模块配置, 提供门户模块的定义和状态管理，包括图标、颜色、模块列表等 */
/**
 * 每个工作端（学生端、教师端、产品层门户、管理员端）对应一个门户模块。
 * 模块包含图标、主色渐变、主色、规划功能列表（i18n key 后缀 + 状态）。
 *
 * 学生端 / 教师端 / 领导端当前为「已停用」状态：定义保留（代码与模块仍在），
 * 但不展示入口、不在可访问门户列表中、直接输入 URL 也会被重定向回角色默认门户，
 * 见 DISABLED_PORTAL_KEYS 与 isPortalDisabled。
 */

import {
  ApartmentOutlined,
  AuditOutlined,
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CrownOutlined,
  DollarOutlined,
  FileDoneOutlined,
  FlagOutlined,
  FormOutlined,
  HeartOutlined,
  HomeOutlined,
  IdcardOutlined,
  LineChartOutlined,
  MessageOutlined,
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

/**
 * 工作端标识（与后端角色 student/teacher/admin 对齐，leader 为产品层门户）。
 * party 为党员端门户、branch 为支部端门户、academy 为党委学院端门户、school 为党委学校端门户：
 * 后端暂无对应角色与接口，前端全部使用虚拟数据。
 */
export type PortalKey =
  | 'party'
  | 'branch'
  | 'academy'
  | 'school'
  | 'student'
  | 'teacher'
  | 'leader'
  | 'admin'

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
  /**
   * 不在侧栏菜单中展示（模块仍可通过路由访问）。
   * 用于「我的」这类改由顶栏头像菜单进入的页面。
   */
  hiddenFromMenu?: boolean
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
    // 党员端门户：首页近期记录接真实成绩申报接口（先锋指数仍为模拟数据，页面内有说明）；
    // 成绩申报接真实接口；我的已开通并复用真实档案/成绩记录/消息通知页面
    key: 'party',
    icon: <FlagOutlined />,
    gradient: 'linear-gradient(135deg, #a8071a 0%, #f5222d 100%)',
    accent: '#a8071a',
    modules: [
      { key: 'party_m1', status: 'ready', icon: <HomeOutlined /> },
      { key: 'party_m2', status: 'ready', icon: <FormOutlined /> },
      { key: 'party_m4', status: 'ready', icon: <UserOutlined /> },
      { key: 'party_m5', status: 'ready', icon: <AuditOutlined />, hiddenFromMenu: true },
    ],
  },
  {
    // 支部端门户：工作台（党员总数、平均分、待审核申报接真实接口，等级分布由前端计算）、
    // 我的使用虚拟数据预览；审核管理接入党建活动加分审批接口
    // （审批步骤由 GET /api/party-scores + /api/approvals 前端合成，
    //   审核动作走 PUT /api/party-scores/approvals/{id}/approve|reject|transfer），
    // 支部管理按组织树深度判定所属支部并展示其成员（有下级支部则展示组织树），均接真实接口
    key: 'branch',
    icon: <ApartmentOutlined />,
    gradient: 'linear-gradient(135deg, #873800 0%, #fa8c16 100%)',
    accent: '#873800',
    modules: [
      { key: 'branch_m1', status: 'ready', icon: <LineChartOutlined /> },
      { key: 'branch_m3', status: 'ready', icon: <AuditOutlined /> },
      // 我的：不再占用侧栏入口，改由顶栏头像菜单进入
      { key: 'branch_m4', status: 'preview', icon: <UserOutlined />, hiddenFromMenu: true },
      { key: 'branch_m5', status: 'ready', icon: <ApartmentOutlined /> },
    ],
  },
  {
    // 党委学院端门户：工作台（党员总数、平均分、各支部排名均接真实接口）、我的使用虚拟数据预览；
    // 指标与审批模板管理为同一功能，接真实审批模板接口；
    // 审核管理接入党建活动加分审批接口（加分审批步骤 / 通过 / 驳回 / 转交），
    // 学院支部管理与支部端同一套支部判定逻辑，均接真实接口
    key: 'academy',
    icon: <BookOutlined />,
    gradient: 'linear-gradient(135deg, #531dab 0%, #9254de 100%)',
    accent: '#531dab',
    modules: [
      { key: 'academy_m1', status: 'ready', icon: <HomeOutlined /> },
      { key: 'academy_m2', status: 'ready', icon: <ProfileOutlined /> },
      { key: 'academy_m3', status: 'ready', icon: <AuditOutlined /> },
      // 我的：不再占用侧栏入口，改由顶栏头像菜单进入
      { key: 'academy_m4', status: 'preview', icon: <UserOutlined />, hiddenFromMenu: true },
      { key: 'academy_m5', status: 'ready', icon: <ApartmentOutlined /> },
    ],
  },
  {
    // 党委学校端门户：菜单顺序为 总览 → 组织成员管理 → 岗位管理 → 系统权限管理；
    // 总览包含全校驾驶舱统计与组织概览（组织树 + 下级组织统计），均接真实接口；
    // 组织成员管理复用管理端「组织架构」页面，系统权限管理复用管理端「角色权限」页面，
    // 岗位管理复用管理端「岗位管理」页面，均接真实接口
    key: 'school',
    icon: <SafetyCertificateOutlined />,
    gradient: 'linear-gradient(135deg, #006d75 0%, #13c2c2 100%)',
    accent: '#08979c',
    modules: [
      { key: 'school_m1', status: 'ready', icon: <LineChartOutlined /> },
      { key: 'school_m2', status: 'ready', icon: <ApartmentOutlined /> },
      { key: 'school_m5', status: 'ready', icon: <IdcardOutlined /> },
      { key: 'school_m3', status: 'ready', icon: <SafetyCertificateOutlined /> },
      // 我的：不占用侧栏入口，改由顶栏头像菜单进入
      { key: 'school_m4', status: 'preview', icon: <UserOutlined />, hiddenFromMenu: true },
    ],
  },
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
      { key: 'student_m10', status: 'ready', icon: <MessageOutlined /> },
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
      { key: 'leader_m9', status: 'ready', icon: <DollarOutlined /> },
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
      { key: 'admin_m5', status: 'ready', icon: <AuditOutlined /> },
    ],
  },
]

/**
 * getPortal 的参数与返回值说明。
 * @param key 类型：string | undefined；默认值：无；是否必填：必填
 * @returns 类型：PortalDef | undefined
 */
export function getPortal(key: string | undefined): PortalDef | undefined {
  return PORTALS.find((p) => p.key === key)
}

/**
 * 已停用的门户（学生端 / 教师端 / 领导端）。
 * 代码与模块定义均保留，但对外不开放：可访问门户列表会过滤掉它们，
 * PortalWorkspace 也会把直接输入 /portal/<key> 的访问重定向回角色默认门户。
 */
export const DISABLED_PORTAL_KEYS: PortalKey[] = ['student', 'teacher', 'leader']

/**
 * 判断门户是否已停用（不可访问）。
 * @param key 门户 key（可为 undefined，例如 URL 参数缺失时）
 * @returns true 表示该门户已停用
 */
export function isPortalDisabled(key: string | undefined): boolean {
  return DISABLED_PORTAL_KEYS.includes(key as PortalKey)
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
 * 如果多个角色代码匹配，返回优先级最高的门户端；已停用的门户（学生端 / 教师端 / 领导端）返回 undefined。
 * @param roleCodes 当前用户的角色 code 列表（必填）
 * @returns 对应的 PortalKey；无匹配角色或门户已停用时返回 undefined
 */
export function getPortalKeyByRoleCodes(roleCodes: string[]): PortalKey | undefined {
  const normalized = new Set(roleCodes.map((code) => code.trim().toLowerCase()))
  const matchedRole = ROLE_PORTAL_PRIORITY.find((role) => normalized.has(role))
  const portalKey = matchedRole ? ROLE_TO_PORTAL[matchedRole] : undefined
  return portalKey && !isPortalDisabled(portalKey) ? portalKey : undefined
}

/**
 * 根据角色代码获取当前用户可访问的全部门户 key。
 * 返回顺序与 PORTALS 定义顺序一致，便于下拉菜单按学生/教师/领导/管理排列；
 * 已停用的门户（学生端 / 教师端 / 领导端）会被过滤，不再出现在可访问列表中。
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
  return PORTALS.filter(
    (portal) => allowedPortals.has(portal.key) && !isPortalDisabled(portal.key),
  ).map((portal) => portal.key)
}

/** 角色信息最小字段：门户可访问性判定只需角色 code 与名称（必填） */
export interface PortalRole {
  code: string
  name: string
}

/** 超级管理员按系统角色编码精确识别，避免名称变更影响门户访问。 */
export function isSuperAdminRole(role: PortalRole): boolean {
  return role.code.trim().toLowerCase() === 'super_admin'
}

/** 默认门户：所有人登录后默认进入党员端（支部书记 / 党委委员 / 校级党委按任职职位另行分流） */
export const DEFAULT_PORTAL_KEY: PortalKey = 'party'

/** 党员端门户 key：默认门户，全部登录用户可访问 */
export const PARTY_PORTAL_KEY: PortalKey = 'party'

/** 党委支部端门户 key：仅支部书记（party_branch）职位可访问 */
export const BRANCH_PORTAL_KEY: PortalKey = 'branch'

/** 党委学院端门户 key：仅党委委员（party_committee）职位可访问 */
export const ACADEMY_PORTAL_KEY: PortalKey = 'academy'

/** 党委学校端门户 key：仅校级党委（party_sch）职位可访问 */
export const SCHOOL_PORTAL_KEY: PortalKey = 'school'

/**
 * 各门户「我的」模块 key。
 * 党员端「我的」保留在左侧菜单；支部端 / 学院端 / 学校端仍隐藏侧栏入口，
 * 统一由顶栏头像菜单进入。
 */
export const PORTAL_PROFILE_MODULE_KEYS: Partial<Record<PortalKey, string>> = {
  [BRANCH_PORTAL_KEY]: 'branch_m4',
  [ACADEMY_PORTAL_KEY]: 'academy_m4',
  [SCHOOL_PORTAL_KEY]: 'school_m4',
}

/**
 * 登录后默认门户：支部职位（party_branch）→ 党委支部端；
 * 学院职位（party_committee）→ 党委学院端；学校职位（party_sch）→ 党委学校端；其余 → 党员端。
 * 多个职位同时命中时按支部、学院、学校的顺序优先。
 * @param positions 当前用户的任职职位编码（必填）
 * @returns 默认进入的 PortalKey（必返回；无匹配职位时为党员端）
 */
export function resolveDefaultPortalKey(positions: { code: string }[]): PortalKey {
  return resolveDefaultPartyPortalKey(positions)
}

/**
 * 根据系统角色和组织任职获取当前用户可访问的全部门户：
 *   党员端：全部登录用户；
 *   党委支部端：支部职位及学院、学校上级职位；
 *   党委学院端：学院职位及学校上级职位；
 *   党委学校端：仅校级党委职位（party_sch）；
 *   其余门户（管理端）仍按原有角色 code 映射；学生端 / 教师端 / 领导端已停用，不会返回。
 * 返回顺序为党员端 / 支部端 / 学院端 / 学校端在前，其余按 PORTALS 定义顺序。
 * @param roles 当前用户的角色列表（必填）
 * @returns 非空的 PortalKey 数组（必返回；至少包含党员端）
 */
export function getAccessiblePortalKeys(roles: PortalRole[], positions: { code: string }[] = []): PortalKey[] {
  const allowed = new Set<PortalKey>([PARTY_PORTAL_KEY, ...getPortalKeysByRoleCodes(roles.map((role) => role.code))])
  const partyKeys: PortalKey[] = getAccessiblePartyPortalKeys(positions)
  const restKeys = PORTALS.filter(
    (portal) =>
      allowed.has(portal.key) && !partyKeys.includes(portal.key) && !isPortalDisabled(portal.key),
  ).map((portal) => portal.key)
  return [...partyKeys, ...restKeys]
}
