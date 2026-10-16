/**
 * 党委支部端 / 党委学院端：支部管理（所属支部及其下级组织的成员信息）。
 * 两端共用本组件，仅侧栏高亮与详情页返回来源（fromModuleKey）不同。
 *
 * 所属支部判定（需求：支部位于组织树第 3 / 4 层）：
 *   1. GET /api/credentials/me                   当前登录用户 uid
 *   2. GET /api/organization-members?uids={uid}  该用户全部任职组织
 *   3. 对每个任职组织 GET /api/organizations/{id}/tree →「根 → 该组织」链路（含 level）
 *   4. 链路深度（上级组织数量 = 链条数 - 1）命中 BRANCH_ANCESTOR_DEPTHS(3 或 4) 即为支部；
 *      多个任职组织命中时取任职列表中的第一个；均未命中则回退为该用户第一个任职组织，
 *      保证学院层级等非支部账号进入本页也能看到自己组织的人员（而非空白页）。
 *
 * 组织树展示（需求：支部还有下级支部才展示组织树）：
 *   GET /api/organizations/{id}/subsidiaries 判断该支部是否还有直接下级；
 *   有下级 → 加载全部组织（listAllOrganizations）取「支部 + 其全部下级」子树并展示组织树；
 *   无下级 → 仅传该支部本身，由 OrgMembersExplorer 以 showOrgTree=false 仅展示成员表。
 *
 * 复用说明（代码要求 1）：组织树、成员分页表格与「点击成员进入详情页」全部复用公共组件
 * OrgMembersExplorer（showOrgTree=false 时隐藏组织树、以 orgs[0] 为唯一组织）；
 * 成员详情页经 ?from={fromModuleKey} 让侧栏高亮本模块，并在该来源下隐藏编辑入口。
 * 所有组织/成员查询均走会话缓存（cachedGet），退出登录由 invalidate() 统一清空。
 */
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import {
  getOrganizationTree,
  listAllOrganizations,
  listSubsidiaries,
  listUserOrganizations,
} from '../../api/organizations'
import type { OrganizationInfo } from '../../api/types/organizations'
import OrgMembersExplorer from '../../components/OrgMembersExplorer'
import type { OrgNode } from '../../components/OrgMembersExplorer'
import { BRANCH_ANCESTOR_DEPTHS } from '../../config/organization'
import { useT } from '../../i18n'

/**
 * 按组织树链路深度判定支部（需求：上级组织数量为 3 或 4）。
 *
 * @param orgIds 该用户的全部任职组织 ID（必填；按任职顺序逐个判定）
 * @returns 第一个被判定为支部的组织 ID；均不满足时返回 null
 */
async function findBranchOrg(orgIds: number[]): Promise<number | null> {
  for (const id of orgIds) {
    const chain = await getOrganizationTree(id)
    // 链条数 - 1 即上级组织数量（等于链路首项的 level）
    if (BRANCH_ANCESTOR_DEPTHS.includes(chain.length - 1)) return id
  }
  return null
}

/**
 * 收集以 rootId 为顶点的组织子树（顶点 + 全部下级）。
 *
 * @param all 全部组织列表（必填；含 parent_id 用于建树）
 * @param rootId 顶点组织 ID（必填）
 * @returns 子树组织数组（顶点置 parent_id=null 作为树根展示，顺序为从顶点起的广度优先；找不到顶点时返回空数组）
 */
function collectSubtree(all: OrganizationInfo[], rootId: number): OrganizationInfo[] {
  const root = all.find((o) => o.id === rootId)
  if (!root) return []

  // parent_id -> children 建树，随后从顶点做广度优先遍历
  const childrenByParent = new Map<number, OrganizationInfo[]>()
  for (const o of all) {
    if (o.parent_id == null) continue
    const arr = childrenByParent.get(o.parent_id)
    if (arr) arr.push(o)
    else childrenByParent.set(o.parent_id, [o])
  }

  const result: OrganizationInfo[] = []
  const queue: OrganizationInfo[] = [root]
  while (queue.length > 0) {
    const node = queue.shift()!
    // 顶点组织置为根节点，避免其上级不在子树中时无法在树上展示
    result.push(node.id === rootId ? { ...node, parent_id: null } : node)
    const kids = childrenByParent.get(node.id)
    if (kids) queue.push(...kids)
  }
  return result
}

interface BranchManageViewProps {
  /** 侧栏高亮与详情页返回目标使用的模块 key（支部端 branch_m5 / 学院端 academy_m5） */
  fromModuleKey: string
}

/** 党委支部端 / 党委学院端：支部管理（支部及其下级组织成员查看） */
export default function BranchManageView({ fromModuleKey }: BranchManageViewProps) {
  const t = useT()

  const [orgs, setOrgs] = useState<OrgNode[]>([])
  /** 支部是否还有下级：有下级才展示组织树（需求） */
  const [showOrgTree, setShowOrgTree] = useState(false)
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  /** 解析所属支部并加载其组织范围（force=true 绕过组织缓存，代码要求 5） */
  const loadOrgs = useCallback(
    async (force?: boolean) => {
      setOrgsLoading(true)
      setOrgsError(null)
      try {
        // 1) 当前登录用户的全部任职组织
        const me = await getCurrentUser()
        const mine = await listUserOrganizations(me.uid)
        if (mine.length === 0) {
          setOrgs([])
          setShowOrgTree(false)
          return
        }

        // 2) 按组织树深度判定支部；均未命中时回退为第一个任职组织
        const branchId =
          (await findBranchOrg(mine.map((o) => o.organization_id))) ?? mine[0].organization_id

        // 3) 支部还有下级 → 展示「支部 + 全部下级」组织树；否则仅展示本支部成员表
        const children = await listSubsidiaries(branchId)
        if (children.length > 0) {
          const all = await listAllOrganizations(force)
          setOrgs(collectSubtree(all, branchId))
          setShowOrgTree(true)
        } else {
          const self = mine.find((o) => o.organization_id === branchId)
          setOrgs([{ id: branchId, name: self?.organization_name ?? '' }])
          setShowOrgTree(false)
        }
      } catch (err) {
        // 401 由 http 拦截器统一处理登录态，此处不重复提示
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setOrgsError(extractErrorReason(err, t))
        }
      } finally {
        setOrgsLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    void loadOrgs()
  }, [loadOrgs])

  return (
    <OrgMembersExplorer
      orgs={orgs}
      orgsLoading={orgsLoading}
      orgsError={orgsError}
      onReloadOrgs={(force?: boolean) => void loadOrgs(force)}
      fromModuleKey={fromModuleKey}
      showOrgTree={showOrgTree}
      autoSelectFirst={showOrgTree}
    />
  )
}
