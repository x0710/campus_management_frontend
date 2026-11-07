/**
 * 组织成员按职位统计（支部端 / 党委学院端 / 学校端工作台共用）。
 *
 * 使用 POST /api/organizations/member-counts 批量统计（取代旧的
 * GET /api/organizations/{id}/members?position=... 取分页 total 再逐组织累加的做法）：
 *   1. GET /api/positions 拉取全部职位，把职位名称解析为职位编码（接口走会话缓存）；
 *   2. 每个职位编码一条统计条件 { org_id, position, recursive: true } 交给批量接口，
 *      一次请求即可统计该组织及全部下级组织的人数（同一批最多 100 条，超出自动分批）。
 *
 * 说明：人数由后端按用户 ID 去重，同一成员在多条职位记录 / 多个下级组织任职也只计一次，
 * 口径与学校端组织概览「预备党员人数」一致。
 */
import { listSubsidiaries, queryOrganizationMemberCounts } from '../api/organizations'
import { listAllPositions } from '../api/positions'

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
 * 职位列表读取失败、职位名称未配置对应职位或统计请求失败时，对应职位返回 null
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
  const requests: { name: string; position: string }[] = []
  for (const name of positionNames) {
    const codes = codesByName.get(name) ?? []
    if (codes.length === 0) continue
    result[name] = 0
    for (const code of codes) requests.push({ name, position: code })
  }
  if (requests.length === 0) return result

  try {
    const counts = await queryOrganizationMemberCounts(
      requests.map(({ position }) => ({ org_id: rootId, position, recursive: true })),
    )
    requests.forEach(({ name }, index) => {
      result[name] = (result[name] ?? 0) + (counts[index]?.member_count ?? 0)
    })
  } catch {
    // 统计失败时对应职位人数不可信，回退占位符（null）
    for (const name of positionNames) result[name] = null
  }

  return result
}

/** 职位名称对应的总人数与性别分布（未取到时均为 null） */
export interface PositionGenderCount {
  total: number | null
  male: number | null
  female: number | null
}

/**
 * 按职位名称统计组织及其全部下级组织的人数，并返回性别分布。
 * 统计口径与 {@link countOrgMembersByPositionNames} 一致，额外通过 include=gender 取回男女分布。
 * 职位未配置或统计失败时，total / male / female 均为 null（由调用方展示占位符）。
 *
 * @param rootId 根组织 ID（必填）
 * @param positionNames 职位名称数组（必填；同名职位取全部编码）
 * @returns 职位名称 → { total, male, female }
 */
export async function countOrgMembersByPositionNamesWithGender(
  rootId: number,
  positionNames: readonly string[],
): Promise<Record<string, PositionGenderCount>> {
  const empty = (): PositionGenderCount => ({ total: null, male: null, female: null })
  const result: Record<string, PositionGenderCount> = {}
  for (const name of positionNames) result[name] = empty()

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

  const requests: { name: string; position: string }[] = []
  for (const name of positionNames) {
    const codes = codesByName.get(name) ?? []
    if (codes.length === 0) continue
    result[name] = { total: 0, male: 0, female: 0 }
    for (const code of codes) requests.push({ name, position: code })
  }
  if (requests.length === 0) return result

  try {
    const counts = await queryOrganizationMemberCounts(
      requests.map(({ position }) => ({ org_id: rootId, position, recursive: true })),
      ['gender'],
    )
    requests.forEach(({ name }, index) => {
      const item = counts[index]
      const current = result[name]
      current.total = (current.total ?? 0) + (item?.member_count ?? 0)
      current.male = (current.male ?? 0) + (item?.gender_counts?.male ?? 0)
      current.female = (current.female ?? 0) + (item?.gender_counts?.female ?? 0)
    })
  } catch {
    for (const name of positionNames) result[name] = empty()
  }

  return result
}
