/**
 * 党委支部端：支部管理（本支部成员信息）。
 *
 * 支部是组织架构的最底层组织，没有下级组织，因此不展示组织树、也不做组织切换，
 * 直接展示当前用户所属支部的成员列表（点击成员行或「详情」按钮进入成员详情页）。
 *
 * 数据来源（均走会话缓存 cachedGet，退出登录由 invalidate() 统一清空）：
 *   GET /api/credentials/me                    当前登录用户 uid
 *   GET /api/organization-members?uids={uid}   该用户任职组织，取第一个作为本支部
 *   → GET /api/organizations/{id}/members      该支部成员（由 OrgMembersExplorer 内分页查询）
 *
 * 复用说明（代码要求 1）：成员分页表格与「点击成员进入详情页」复用公共组件 OrgMembersExplorer
 * （showOrgTree=false 时仅展示唯一组织的成员表，隐藏组织树）；成员详情页经 ?from=branch_m5
 * 让侧栏高亮本模块，并在该来源下隐藏成绩/违规编辑入口。
 */
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { listUserOrganizations } from '../../api/organizations'
import OrgMembersExplorer from '../../components/OrgMembersExplorer'
import type { OrgNode } from '../../components/OrgMembersExplorer'
import { useT } from '../../i18n'

/** 党委支部端：支部管理（本支部成员查看，无组织树） */
export default function BranchManageView() {
  const t = useT()

  const [orgs, setOrgs] = useState<OrgNode[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  /** 加载本支部（唯一组织），供成员表使用 */
  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true)
    setOrgsError(null)
    try {
      const me = await getCurrentUser()
      const mine = await listUserOrganizations(me.uid)
      // 支部为最底层组织，取用户第一条任职组织作为唯一支部（无组织树）
      setOrgs(
        mine.slice(0, 1).map((o) => ({ id: o.organization_id, name: o.organization_name })),
      )
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setOrgsError(extractErrorReason(err, t))
      }
    } finally {
      setOrgsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadOrgs()
  }, [loadOrgs])

  return (
    <OrgMembersExplorer
      orgs={orgs}
      orgsLoading={orgsLoading}
      orgsError={orgsError}
      onReloadOrgs={() => void loadOrgs()}
      fromModuleKey="branch_m5"
      showOrgTree={false}
    />
  )
}
