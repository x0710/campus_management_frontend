/**
 * 用户详细信息（profile_detail）类型定义。
 * 对应后端 /api/profile-details 接口，表结构为 user_profile。
 */
import type { PageQuery } from './common'

/** GET /api/profile-details 返回的档案记录 */
export interface ProfileDetail {
  id: number
  user_id: number
  /** 身份证号 */
  id_card: string
  /** 民族 */
  ethnic: string
  /** 出生日期（YYYY-MM-DD） */
  birth_date: string
  /** 班级 ID */
  class_id: number
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

/** GET /api/profile-details 查询参数 */
export interface ProfileDetailQuery extends PageQuery {
  /** 身份证号 / 籍贯模糊搜索 */
  keyword?: string
  /** 按用户 ID 精确筛选 */
  user_id?: number
  /** 按班级 ID 精确筛选 */
  class_id?: number
}
