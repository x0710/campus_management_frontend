/**
 * 民族统计口径。
 *
 * POST /api/organizations/member-counts?include=ethnic 会返回 `ethnic_counts`（民族名称 → 人数），
 * 后端已去除名称首尾空格，未填写或无档案归入 `unknown`。
 * 少数民族人数 = ethnic_counts 中「汉族（汉）」与 unknown 之外的人数之和。
 */

/** 不计入少数民族的名称（含后端未知分组） */
const NON_MINORITY_ETHNIC_LABELS = new Set(['汉', '汉族', 'unknown'])

/**
 * 从 ethnic_counts 计算少数民族人数。
 * @param counts 接口返回的民族分布（可为 null；未选择 include=ethnic 时为 undefined）
 * @returns 少数民族人数（无数据时为 0）
 */
export function countEthnicMinority(counts: Record<string, number> | null | undefined): number {
  if (!counts) return 0
  let total = 0
  for (const [name, count] of Object.entries(counts)) {
    if (NON_MINORITY_ETHNIC_LABELS.has(name.trim())) continue
    total += count
  }
  return total
}
