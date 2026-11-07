/**
 * 组织树工具（党委学校端「组织成员管理」与「组织概览」共用）：
 * - collectOrgSubtree：按固定根节点裁剪出「该节点 + 全部下级」的组织集合；
 * - buildOrgTreeData：按名称/编码关键词过滤并构建 antd Tree 的 treeData（保留匹配节点的祖先链）；
 * - listOrgDescendantIds：列出某个组织的全部下级组织 ID（不含自身），用于递归统计人数；
 * - listOrgChainIds：列出某个组织的祖先链（含自身），用于展开到指定组织节点。
 *
 * 说明：这些函数均为纯函数，不发起请求；组织数据统一由调用方通过
 * listAllOrganizations() 拉取后传入（代码要求 1、5）。
 */
import type { TreeProps } from 'antd/es/tree'
import type { OrganizationInfo } from '../api/types/organizations'

/** 组织链查询所需的最小字段（OrganizationInfo / 任职组织等均可直接传入） */
export interface OrgChainNode {
  /** 组织 ID（必填） */
  id: number
  /** 上级组织 ID（可选，缺省或 null 表示根节点） */
  parent_id?: number | null
}

/**
 * 列出某个组织在组织树上的祖先链（含自身），用于展开到该节点（如搜索命中、跨页跳转定位）。
 * @param orgs 组织集合（必填；需包含 parent_id 以便向上追溯）
 * @param orgId 目标组织 ID（必填）
 * @returns 从目标组织到根的 ID 数组（第一项为目标组织自身）；目标不在集合中时为空数组
 */
export function listOrgChainIds(orgs: OrgChainNode[], orgId: number): number[] {
  const keys: number[] = []
  let cur = orgs.find((org) => org.id === orgId)
  while (cur) {
    keys.push(cur.id)
    const parentId = cur.parent_id
    cur = parentId != null ? orgs.find((org) => org.id === parentId) : undefined
  }
  return keys
}

/**
 * 按固定根节点裁剪组织集合。
 * @param orgs 全部组织（必填，可能为空数组）
 * @param rootOrgId 根组织 ID（可选）；不传时原样返回全部组织（按顶级组织 parent_id=null 建树）
 * @returns 根组织及其全部下级的组织数组（顺序为深度优先前序）
 */
export function collectOrgSubtree(
  orgs: OrganizationInfo[],
  rootOrgId?: number,
): OrganizationInfo[] {
  if (rootOrgId === undefined) return orgs

  const byParent = new Map<number, OrganizationInfo[]>()
  for (const org of orgs) {
    if (org.parent_id == null) continue
    const siblings = byParent.get(org.parent_id)
    if (siblings) siblings.push(org)
    else byParent.set(org.parent_id, [org])
  }

  const result: OrganizationInfo[] = []
  const walk = (id: number) => {
    const org = orgs.find((item) => item.id === id)
    if (!org) return
    result.push(org)
    for (const child of byParent.get(id) ?? []) walk(child.id)
  }
  walk(rootOrgId)
  return result
}

/**
 * 构建左侧组织树数据。
 * @param orgsInTree 展示范围内的组织集合（必填，通常为 collectOrgSubtree 的结果）
 * @param keyword 搜索关键词（可选，空串表示不过滤；仅前端按名称/编码模糊匹配）
 * @param rootOrgId 固定根节点 ID（可选）；不传时以 parent_id=null 的组织为根
 * @returns antd Tree 的 treeData（节点标题为「名称（编码）」）
 */
export function buildOrgTreeData(
  orgsInTree: OrganizationInfo[],
  keyword: string,
  rootOrgId?: number,
): TreeProps['treeData'] {
  const kw = keyword.trim().toLowerCase()
  const filtered = kw
    ? orgsInTree.filter(
        (o) => o.name.toLowerCase().includes(kw) || o.code.toLowerCase().includes(kw),
      )
    : orgsInTree

  // 保留匹配节点的祖先链，使树结构完整
  const visible = new Set<number>()
  for (const o of filtered) {
    let cur: OrganizationInfo | undefined = o
    while (cur) {
      visible.add(cur.id)
      cur = cur.parent_id != null ? orgsInTree.find((x) => x.id === cur!.parent_id) : undefined
    }
  }

  const byParent = new Map<number | null, OrganizationInfo[]>()
  for (const o of orgsInTree) {
    if (kw && !visible.has(o.id)) continue
    const arr = byParent.get(o.parent_id)
    if (arr) arr.push(o)
    else byParent.set(o.parent_id, [o])
  }

  const build = (list?: OrganizationInfo[]): NonNullable<TreeProps['treeData']> =>
    (list ?? []).map((o) => ({
      key: o.id,
      title: `${o.name}（${o.code}）`,
      children: build(byParent.get(o.id)),
    }))

  const roots =
    rootOrgId !== undefined
      ? orgsInTree.filter((o) => o.id === rootOrgId)
      : orgsInTree.filter((o) => o.parent_id === null)
  return build(roots)
}

/**
 * 列出某个组织的全部下级组织 ID（不含自身）。
 * @param orgs 组织集合（必填，至少应包含目标组织的下级）
 * @param orgId 目标组织 ID（必填）
 * @returns 全部下级组织 ID（顺序为深度优先前序；不存在下级时为空数组）
 */
export function listOrgDescendantIds(orgs: OrgChainNode[], orgId: number): number[] {
  const byParent = new Map<number, number[]>()
  for (const org of orgs) {
    if (org.parent_id == null) continue
    const arr = byParent.get(org.parent_id)
    if (arr) arr.push(org.id)
    else byParent.set(org.parent_id, [org.id])
  }

  const result: number[] = []
  const walk = (id: number) => {
    for (const childId of byParent.get(id) ?? []) {
      result.push(childId)
      walk(childId)
    }
  }
  walk(orgId)
  return result
}
