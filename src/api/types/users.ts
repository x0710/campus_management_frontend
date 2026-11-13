/**
 * 用户模块类型定义：用户状态/性别枚举、用户列表项、用户详情、分页查询参数与创建/更新请求体。
 * 供 api/users.ts 的请求函数与各视图复用。
 */
import type { PageQuery, CreatedDateQuery } from './common'

/** 用户状态（对应后端 Status：enabled / disabled） */
export type UserStatus = 'enabled' | 'disabled'

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
  /** 头像（图片地址） */
  avatar: string | null
  created_at: string
  updated_at: string
}

/** 用户分页查询参数 */
export interface UserQuery extends PageQuery, CreatedDateQuery {
  keyword?: string
  status?: UserStatus
  /** 按用户 ID 批量筛选，逗号分隔，如 '1,2,3'（对应后端 ids 查询参数） */
  ids?: string
}

/** POST /api/users 请求元素（body 为数组，支持批量创建） */
export interface UserCreateRequest {
  /** 用户 ID（学号/工号），前端指定、必填且为正整数；后端不再自动生成，已存在返回 409 */
  uid: number
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

/** POST /api/users 单条创建结果（按输入顺序返回；密码仅在本次成功设置时提供） */
export interface UserCreateResult {
  uid: number
  username: string
  /** created 新建 / replaced 按 UID 替换 / ignored 重复跳过 */
  status: 'created' | 'replaced' | 'ignored'
  new_password?: string | null
}

/** POST /api/users 批量创建响应 */
export interface UserCreateResponse {
  /** 实际写入数（新建加替换，不计跳过项） */
  count: number
  results: UserCreateResult[]
}

/** PATCH /api/users/{id} 可更新字段 */
export interface UserUpdateRequest {
  name?: string
  email?: string | null
  phone?: string | null
  /** YYYY-MM-DD */
  birthday?: string | null
  gender?: Gender
  /** 头像（图片地址） */
  avatar?: string
}

/** PATCH /api/users 批量更新元素（user_id 与可更新字段） */
export interface UserBatchUpdate extends UserUpdateRequest {
  user_id: number
}
