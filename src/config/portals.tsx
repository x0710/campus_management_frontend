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
  DollarOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
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
  RiseOutlined,
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
 * party 为党员端门户、branch 为党委支部端门户、academy 为党委学院端门户、school 为党委学校端门户：
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
    // 成绩申报、整改提升使用虚拟数据预览；我的已开通并复用真实档案/成绩记录/消息通知页面
    key: 'party',
    icon: <FlagOutlined />,
    gradient: 'linear-gradient(135deg, #a8071a 0%, #f5222d 100%)',
    accent: '#a8071a',
    modules: [
      { key: 'party_m1', status: 'ready', icon: <HomeOutlined /> },
      { key: 'party_m2', status: 'ready', icon: <FormOutlined /> },
      { key: 'party_m3', status: 'preview', icon: <RiseOutlined /> },
      { key: 'party_m4', status: 'ready', icon: <UserOutlined /> },
    ],
  },
  {
    // 党委支部端门户：工作台（党员总数、平均分、待审核申报接真实接口，等级分布由前端计算）、
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
    // 党委学校端门户：总览（党员总数、平均分、各二级党委排名均接真实接口）；
    // 组织管理复用管理端「组织架构」页面，系统权限管理复用管理端「角色权限」页面，
    // 岗位管理复用管理端「岗位管理」页面，均接真实接口
    key: 'school',
    icon: <SafetyCertificateOutlined />,
    gradient: 'linear-gradient(135deg, #006d75 0%, #13c2c2 100%)',
    accent: '#08979c',
    modules: [
      { key: 'school_m2', status: 'ready', icon: <ApartmentOutlined /> },
      { key: 'school_m1', status: 'ready', icon: <LineChartOutlined /> },
      { key: 'school_m3', status: 'ready', icon: <SafetyCertificateOutlined /> },
      // 我的：不占用侧栏入口，改由顶栏头像菜单进入
      { key: 'school_m4', status: 'preview', icon: <UserOutlined />, hiddenFromMenu: true },
      { key: 'school_m5', status: 'ready', icon: <IdcardOutlined /> },
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

/** 角色信息最小字段：门户可访问性判定只需角色 code 与名称（必填） */
export interface PortalRole {
  code: string
  name: string
}

/** 默认门户：所有人登录后默认进入党员端（支部书记 / 书记按角色另行分流） */
export const DEFAULT_PORTAL_KEY: PortalKey = 'party'

/** 党员端门户 key：默认门户，全部登录用户可访问 */
export const PARTY_PORTAL_KEY: PortalKey = 'party'

/** 党委支部端门户 key：仅支部书记角色可访问 */
export const BRANCH_PORTAL_KEY: PortalKey = 'branch'

/** 党委学院端门户 key：仅书记（学院书记）角色可访问 */
export const ACADEMY_PORTAL_KEY: PortalKey = 'academy'

/** 党委学校端门户 key：仅学校书记角色可访问 */
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
 * 角色名称 / 编码关键字匹配（名称与编码任一命中即可）。
 * @param role 角色信息（必填）
 * @param nameKeywords 角色名称需同时包含的中文关键字（必填，可为空数组）
 * @param codeKeywords 角色编码需同时包含的英文关键字（必填，小写，可为空数组）
 * @returns 是否命中
 */
function roleMatches(role: PortalRole, nameKeywords: string[], codeKeywords: string[]): boolean {
  const nameHit =
    nameKeywords.length > 0 && nameKeywords.every((keyword) => role.name.includes(keyword))
  const code = role.code.trim().toLowerCase()
  const codeHit =
    codeKeywords.length > 0 && codeKeywords.every((keyword) => code.includes(keyword))
  return nameHit || codeHit
}

/** 支部书记：名称含「支部」「书记」，或编码同时含 branch / secretary */
function isBranchSecretary(role: PortalRole): boolean {
  return roleMatches(role, ['支部', '书记'], ['branch', 'secretar'])
}

/** 学校书记：名称含「学校」「书记」，或编码同时含 school / secretary */
function isSchoolSecretary(role: PortalRole): boolean {
  return roleMatches(role, ['学校', '书记'], ['school', 'secretar'])
}

/** 学院书记：名称含「书记」（排除支部 / 学校书记），或编码为 academy / college secretary */
function isAcademySecretary(role: PortalRole): boolean {
  if (isBranchSecretary(role) || isSchoolSecretary(role)) return false
  if (role.name.includes('书记')) return true
  const code = role.code.trim().toLowerCase()
  return (code.includes('academy') || code.includes('college')) && code.includes('secretar')
}

/**
 * 登录后默认门户：支部书记 → 党委支部端；书记 → 党委学院端；其余 → 党员端。
 * 多个角色同时命中时按支部书记、学院书记、学校书记的顺序优先。
 * @param roles 当前用户的角色列表（必填）
 * @returns 默认进入的 PortalKey（必返回；无匹配角色时为党员端）
 */
export function resolveDefaultPortalKey(roles: PortalRole[]): PortalKey {
  if (roles.some(isBranchSecretary)) return BRANCH_PORTAL_KEY
  if (roles.some(isAcademySecretary)) return ACADEMY_PORTAL_KEY
  if (roles.some(isSchoolSecretary)) return SCHOOL_PORTAL_KEY
  return DEFAULT_PORTAL_KEY
}

/**
 * 根据角色获取当前用户可访问的全部门户：
 *   党员端：全部登录用户；
 *   党委支部端：仅支部书记；
 *   党委学院端：仅书记；
 *   党委学校端：仅学校书记；
 *   其余门户（学生 / 教师 / 领导 / 管理）仍按原有角色 code 映射。
 * 返回顺序为党员端 / 支部端 / 学院端 / 学校端在前，其余按 PORTALS 定义顺序。
 * @param roles 当前用户的角色列表（必填）
 * @returns 非空的 PortalKey 数组（必返回；至少包含党员端）
 */
export function getAccessiblePortalKeys(roles: PortalRole[]): PortalKey[] {
  const allowed = new Set<PortalKey>([PARTY_PORTAL_KEY, ...getPortalKeysByRoleCodes(roles.map((role) => role.code))])
  if (roles.some(isBranchSecretary)) allowed.add(BRANCH_PORTAL_KEY)
  if (roles.some(isAcademySecretary)) allowed.add(ACADEMY_PORTAL_KEY)
  if (roles.some(isSchoolSecretary)) allowed.add(SCHOOL_PORTAL_KEY)

  const partyKeys = [PARTY_PORTAL_KEY, BRANCH_PORTAL_KEY, ACADEMY_PORTAL_KEY, SCHOOL_PORTAL_KEY].filter(
    (key) => allowed.has(key),
  )
  const restKeys = PORTALS.filter((portal) => allowed.has(portal.key) && !partyKeys.includes(portal.key)).map(
    (portal) => portal.key,
  )
  return [...partyKeys, ...restKeys]
}
