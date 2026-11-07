/**
 * 用户详细信息（profile_detail）类型定义。
 * 对应后端 /api/profile-details 接口，表结构为 user_profile。
 */
import type { PageQuery } from './common'

/** GET /api/profile-details 返回的档案记录 */
export interface ProfileDetail {
  id: number
  user_id: number
  /** 身份证号（可为空） */
  id_card: string | null
  /** 民族（可为空） */
  ethnic: string | null
  /** 出生日期（后端 DateTime，可为空） */
  birth_date: string | null
  /** 籍贯 */
  native_place: string | null
  /** 户口所在地 */
  household_location: string | null
  /** 户口性质 */
  household_type: string | null
  phone: string | null
  email: string | null
  /** 父亲姓名 */
  father_name: string | null
  /** 父亲电话 */
  father_phone: string | null
  /** 父亲工作单位 */
  father_company: string | null
  /** 母亲姓名 */
  mother_name: string | null
  /** 母亲电话 */
  mother_phone: string | null
  /** 母亲工作单位 */
  mother_company: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * 保存档案请求（POST /api/profile-details 创建、PUT /api/profile-details 新增或更新）。
 * 必填：user_id；其余字段可省略或传 null。
 */
export interface ProfileDetailCreateRequest {
  user_id: number
  /** 身份证号 */
  id_card?: string | null
  /** 民族 */
  ethnic?: string | null
  /** 出生日期（YYYY-MM-DD） */
  birth_date?: string | null
  /** 籍贯 */
  native_place?: string | null
  /** 户口所在地 */
  household_location?: string | null
  /** 户口性质 */
  household_type?: string | null
  phone?: string | null
  email?: string | null
  /** 父亲姓名 */
  father_name?: string | null
  /** 父亲电话 */
  father_phone?: string | null
  /** 父亲工作单位 */
  father_company?: string | null
  /** 母亲姓名 */
  mother_name?: string | null
  /** 母亲电话 */
  mother_phone?: string | null
  /** 母亲工作单位 */
  mother_company?: string | null
}

/** 更新档案请求（PATCH /api/profile-details/{id}，除 user_id 外字段全部可选且可置 null） */
export type ProfileDetailUpdateRequest = Partial<Omit<ProfileDetailCreateRequest, 'user_id'>>

/** GET /api/profile-details 查询参数 */
export interface ProfileDetailQuery extends PageQuery {
  /** 身份证号 / 籍贯模糊搜索 */
  keyword?: string
  /** 按用户 ID 精确筛选 */
  user_id?: number
  /** 按用户 ID 批量筛选（逗号分隔，如 "1,2,3"；配合 page_size 使用） */
  uids?: string
}
