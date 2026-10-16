/**
 * 党委学院端：学院支部管理（以本学院为顶点的组织树 + 各支部成员信息）。
 *
 * 学院位于支部之上，故保留组织树：以当前用户所属学院为顶点，可切换下级支部查看其成员
 * （点击成员行或「详情」按钮进入成员详情页）。
 *
 * 数据来源（均走会话缓存 cachedGet，退出登录由 invalidate() 统一清空）：
 *   GET /api/credentials/me                     当前登录用户 uid
 *   GET /api/organization-members?uids={uid}    该用户任职组织，取第一个作为学院顶点
 *   GET /api/organizations                      全部组织（分页取满，listAllOrganizations）
 *   → 按 parent_id 过滤出「学院顶点 + 其全部下级（支部）」子树（顶点作为树根展示）
 *   → GET /api/organizations/{id}/members       所选组织成员（复用 OrgMembersExplorer 内分页查询）
 *
 * 复用说明（代码要求 1）：组织树、成员分页表格与「点击成员进入详情页」全部复用公共组件
 * OrgMembersExplorer；成员详情页经 ?from=academy_m5 让侧栏高亮本模块，并在该来源下隐藏编辑入口。
 */
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { listAllOrganizations, listUserOrganizations } from '../../api/organizations'
import type { OrganizationInfo } from '../../api/types/organizations'
import OrgMembersExplorer from '../../components/OrgMembersExplorer'
import { useT } from '../../i18n'

/**
 * 收集以 rootId 为顶点的组织子树（顶点 + 全部下级）。
 *
 * @param all 全部组织列表（必填；含 parent_id 用于建树）
 * @param rootId 顶点组织 ID（必填）
 * @returns 子树组织数组（必返回；顶点置 parent_id=null 使其在组织树中作为根节点展示，找不到顶点时返回空数组）
 */
function collectSubtree(all: OrganizationInfo[], rootId: number): OrganizationInfo[] {
  const byId = new Map(all.map((o) => [o.id, o]))
  const root = byId.get(rootId)
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

/** 党委学院端：学院支部管理（本学院组织树 + 支部成员查看） */
export default function AcademyBranchManageView() {
  const t = useT()

  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  /** 加载本学院组织树（force=true 绕过组织缓存，代码要求 5） */
  const loadOrgs = useCallback(
    async (force?: boolean) => {
      setOrgsLoading(true)
      setOrgsError(null)
      try {
        // 1) 当前登录用户所在组织（取第一个作为学院顶点）
        const me = await getCurrentUser()
        const mine = await listUserOrganizations(me.uid)
        if (mine.length === 0) {
          setOrgs([])
          return
        }
        // 2) 全部组织 → 过滤出以本学院为顶点的子树
        const all = await listAllOrganizations(force)
        setOrgs(collectSubtree(all, mine[0].organization_id))
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
      fromModuleKey="academy_m5"
      autoSelectFirst
    />
  )
}
