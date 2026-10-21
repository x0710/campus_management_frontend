/**
 * 人员搜索关键字判定工具（组织架构、用户与账户等多处复用，代码要求 1）。
 */

/**
 * 判断搜索关键字应否按「学号」（用户 ID）查询。
 * 约定：纯数字视为学号；其余（含字母、中文等）视为姓名。
 * @param raw 搜索关键字（必填；调用方应先行 trim）
 * @returns true 表示按学号查询，false 表示按姓名查询
 */
export function isUidTerm(raw: string): boolean {
  return /^\d+$/.test(raw)
}
