/**
 * 用户模块类型定义：用户状态/性别枚举、用户列表项、用户详情、分页查询参数与创建/更新请求体。
 * 供 api/users.ts 的请求函数与各视图复用。
 */
import type { PageQuery } from './common'

/** 用户状态 */
export type UserStatus = 'active' | 'disabled'

/** 性别 */
export type Gender = 'male' | 'female'

/** GET /api/users 列表项（后端仅返回 uid/name） */
export interface UserInfo {
  uid: number
  name: string | null
}

/** GET /api/users/{id} 用户详情 */
export interface UserDetail {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  /** YYYY-MM-DD */
  birthday: string | null
  gender: string | null
  avatar: string | null
  created_at: string
  updated_at: string
}

/** 用户分页查询参数 */
export interface UserQuery extends PageQuery {
  keyword?: string
  status?: UserStatus
}

/** POST /api/users 请求元素（body 为数组，支持批量创建） */
export interface UserCreateRequest {
  username: string
  /** 不填后端自动生成随机密码 */
  password?: string
  name?: string
  gender?: Gender
  /** 任职组织（与 pos/workplaces 按下标并行） */
  org?: number[]
  pos?: string[]
  workplaces?: string[]
}

/** PATCH /api/users/{id} 可更新字段 */
export interface UserUpdateRequest {
  name?: string
  email?: string
  phone?: string
  /** YYYY-MM-DD */
  birthday?: string | null
  gender?: Gender
  avatar?: string
}