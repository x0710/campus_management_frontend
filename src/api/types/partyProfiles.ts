/**
 * 党员档案（party-profile）类型定义。
 *
 * 对应后端 `GET /api/party/profiles?uids=...` 返回项 / 创建、更新请求体：
 * - `party_no` 党员编号（int64，可为空）
 * - `join_time` 入党时间（后端保留数据库原始字符串，可为空）
 */
export interface PartyProfile {
  /** 用户 ID（必填） */
  user_id: number
  /** 党员编号（可为空） */
  party_no: number | null
  /** 入党时间（后端原始字符串，可为空） */
  join_time: string | null
}

/** 创建党员档案请求（user_id 必填） */
export interface PartyProfileCreateRequest {
  user_id: number
  party_no?: number | null
  join_time?: string | null
}

/** 更新党员档案请求（缺省字段保持原值，显式 null 表示清空） */
export interface PartyProfileUpdateRequest {
  party_no?: number | null
  join_time?: string | null
}

/** PATCH /api/party/profiles 批量更新元素（user_id + 可更新字段） */
export interface PartyProfileBatchUpdate extends PartyProfileUpdateRequest {
  user_id: number
}
