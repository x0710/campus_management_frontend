/**
 * 「批量添加新成员」写入逻辑的公共类型。
 */
import type { UserOrganization } from '../../api/types/organizations'
import type { TranslateFn } from '../../i18n'

/** 单行导入结果 */
export interface MemberImportOutcome {
  /** Excel 行号（1 基，必填） */
  row: number
  /** 姓名（必填，可能为空串） */
  name: string
  /** 登录账号名（必填） */
  username: string
  /** 用户 ID（必填；导入时由登录账号名得到） */
  uid: number | null
  /** create = 新建账号；update = 账号已存在，更新其资料 */
  action: 'create' | 'update'
  /**
   * success = 全部写入成功；partial = 账号已建/已更新但部分信息失败；
   * failed = 账号创建失败；cancelled = 用户取消，尚未开始处理该行
   */
  status: 'success' | 'partial' | 'failed' | 'cancelled'
  /** 失败 / 部分成功的原因（已翻译，可空） */
  message?: string
}

/** 一次导入请求的日志（供页面导出「本次都做了哪些请求」） */
export interface MemberImportRequestLog {
  /** 序号（从 1 开始，必填） */
  seq: number
  /** 发起时间（本地时间字符串，必填） */
  at: string
  /** 阶段说明的 i18n key（必填） */
  phaseKey: string
  /** HTTP 方法（必填） */
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** 请求路径（必填） */
  path: string
  /** 本次请求涉及的数据条数（行数 / UID 数，必填） */
  count: number
  /** 请求结果（必填） */
  status: 'success' | 'failed' | 'aborted'
  /** 失败原因（已翻译，可空） */
  message?: string
}

/** 单次请求的元信息（用于进度与日志） */
export interface RequestMeta {
  phaseKey: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  count: number
}

/**
 * 导入进度与日志记录器。
 * total 在启动前一次性预估，done 每结束一个请求 +1；
 * 分片结束时把「预估但没发出」的请求从 total 中扣掉，避免进度条卡住不动。
 */
export interface ImportTelemetry {
  t: TranslateFn
  signal?: AbortSignal
  done: number
  total: number
  seq: number
  chunkPlanned: number
  chunkExecuted: number
  onProgress?: (done: number, total: number) => void
  onLog?: (entry: MemberImportRequestLog) => void
}

/** 跨分片共享的导入状态 */
export interface ImportState {
  state: ImportTelemetry
  existingUids: Set<number>
  existingRoles: Map<number, number[]>
  orgByUid: Map<number, UserOrganization[]>
  partyProfileUids: Set<number>
  warningsByRow: Map<number, string[]>
  failed: Map<number, MemberImportOutcome>
  createdRows: Set<number>
  completedRows: Set<number>
}
