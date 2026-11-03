/**
 * 组织成员按职位统计（党委支部端 / 党委学院端工作台共用）。
 *
 * GET /api/organizations/{id}/members 支持 position 过滤并返回分页 total，
 * 因此可以按职位名称统计人数（如「中共党员」「中共预备党员」）：
 *   1. GET /api/positions 拉取全部职位，把职位名称解析为职位编码（接口走会话缓存）；
 *   2. 对目标组织及其全部下级组织，逐个职位编码用 page_size=1 只取 total 后相加。
 *
 * 说明：按职位记录数统计；同一用户在同一组织有多条职位记录时会重复计数
 * （与学校端组织概览「预备党员人数」口径一致）。
 */
import { listSubsidiaries, queryOrgMembers } from '../api/organizations'
import { listAllPositions } from '../api/positions'
import { ORG_OVERVIEW_STATS_CONCURRENCY } from '../config/organization'

/**
 * 列出组织自身及其全部下级组织 ID。
 * @param rootId 根组织 ID（必填）
 * @returns 组织自身与全部下级组织 ID（广度优先顺序）
 */
export async function listOrgSelfAndDescendantIds(rootId: number): Promise<number[]> {
  const ids = [rootId]
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) continue
    const children = await listSubsidiaries(current)
    for (const child of children) {
      ids.push(child.id)
      queue.push(child.id)
    }
  }
  return ids
}

/**
 * 按职位名称统计组织及其全部下级组织的成员人数。
 *
 * 职位列表读取失败、职位名称不存在或组织下级查询失败时，对应职位返回 null
 * （由调用方展示占位符），不阻塞工作台其余统计。
 *
 * @param rootId 根组织 ID（必填）
 * @param positionNames 职位名称数组（必填；同名职位取全部编码）
 * @returns 职位名称 → 人数 | null
 */
export async function countOrgMembersByPositionNames(
  rootId: number,
  positionNames: readonly string[],
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {}
  for (const name of positionNames) result[name] = null

  let orgIds: number[]
  try {
    orgIds = await listOrgSelfAndDescendantIds(rootId)
  } catch {
    return result
  }

  let codesByName: Map<string, string[]>
  try {
    const positions = await listAllPositions()
    codesByName = new Map(
      positionNames.map((name) => [
        name,
        positions
          .filter((position) => position.name.trim() === name)
          .map((position) => position.code),
      ]),
    )
  } catch {
    return result
  }

  // 无对应职位编码说明职位未配置，保持 null 而不是 0，避免把「未配置」误读为「0 人」
  for (const name of positionNames) {
    if ((codesByName.get(name) ?? []).length > 0) result[name] = 0
  }

  for (let start = 0; start < orgIds.length; start += ORG_OVERVIEW_STATS_CONCURRENCY) {
    const chunk = orgIds.slice(start, start + ORG_OVERVIEW_STATS_CONCURRENCY)
    const chunkCounts = await Promise.all(
      chunk.map(async (orgId) => {
        const entries = await Promise.all(
          positionNames.map(async (name) => {
            const totals = await Promise.all(
              (codesByName.get(name) ?? []).map((code) =>
                queryOrgMembers(orgId, { page: 1, page_size: 1, position: code })
                  .then((res) => res.total)
                  .catch(() => null),
              ),
            )
            // 任一职位查询失败则该职位人数不可信，返回 null 交由调用方展示占位符
            if (totals.some((count) => count === null)) return [name, null] as const
            return [
              name,
              (totals as number[]).reduce((sum, count) => sum + count, 0),
            ] as const
          }),
        )
        return entries
      }),
    )
    for (const entries of chunkCounts) {
      for (const [name, count] of entries) {
        // 职位未配置 / 查询失败时保持 null（不参与累加）
        if (count === null || result[name] === null) {
          result[name] = null
          continue
        }
        result[name] += count
      }
    }
  }

  return result
}
