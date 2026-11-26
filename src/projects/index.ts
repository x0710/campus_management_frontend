/**
 * 项目（部署形态）定义。
 *
 * 这里是仓库中唯一回答「这个站点对外提供哪些门户」的地方。
 * 一个「项目」是一套部署配置，不是一套独立代码：
 *   - portals：该项目对外提供的门户，顺序即门户切换菜单的顺序；
 *   - defaultPortal：登录后未命中任何角色 / 任职时的落点；
 *   - brand：对外品牌（系统主色）。
 *
 * 选择项目由构建 / 启动时的 VITE_PROJECT 决定，见 .env.party 与 .env.campus：
 *   yarn dev:party    → 党建项目，站点基路径 /campus/party
 *   yarn dev:campus   → 校园平台，站点基路径 /campus
 *
 * 不在当前项目 portals 内的门户，页面代码仍然保留（同一份代码复用），
 * 但不会被注册成路由，也不会出现在任何入口里。
 */
import type { PortalKey } from '../config/portals'

export type ProjectKey = 'party' | 'campus'

/** 对外品牌：随项目变化的部分集中在这里，避免散落在组件与主题配置里。 */
export interface ProjectBrand {
  /** antd 主色（按钮、选中态、日期控件等） */
  primary: string
  /** 链接色 */
  link: string
}

export interface ProjectProfile {
  key: ProjectKey
  /** 该项目对外提供的门户；不在此列表内的门户一律视为不存在的入口 */
  portals: readonly PortalKey[]
  /** 登录后的默认门户 */
  defaultPortal: PortalKey
  brand: ProjectBrand
}

const party: ProjectProfile = {
  key: 'party',
  // 党建项目：党员端 / 支部端 / 党委学院端 / 党委学校端 + 管理端
  portals: ['party', 'branch', 'academy', 'school', 'admin'],
  defaultPortal: 'party',
  brand: { primary: '#b4232b', link: '#a61f27' },
}

const campus: ProjectProfile = {
  key: 'campus',
  // 校园管理平台：学生端 / 教师端 / 领导端 + 管理端
  portals: ['student', 'teacher', 'leader', 'admin'],
  defaultPortal: 'student',
  brand: { primary: '#2f54eb', link: '#1d39c4' },
}

export const PROJECTS: Record<ProjectKey, ProjectProfile> = { party, campus }

/**
 * 当前项目。VITE_PROJECT 由构建期注入；
 * 未配置时回退 party，保证历史启动方式（yarn dev）行为不变。
 */
export const PROJECT_KEY: ProjectKey =
  import.meta.env?.VITE_PROJECT === 'campus' ? 'campus' : 'party'

export const PROJECT: ProjectProfile = PROJECTS[PROJECT_KEY]
