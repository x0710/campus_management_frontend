/**
 * 领导端：组织概览（只读展示全部组织的组织树 + 成员表）。
 *
 * 本页只负责加载「全部组织」（GET /api/organizations 分页循环取满，见 listAllOrganizations），
 * 组织树、成员分页查询与「点击成员进入详情页」等交互统一复用公共组件 OrgMembersExplorer
 * （同一组件也被老师端「班级管理」复用，代码要求 1）。
 *
 * 交互（代码要求 14）：点击成员行跳转到「成员详情」页（成绩/请假/违规信息），
 * 携带 ?from=leader_m3 使侧栏仍高亮本模块。
 */
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { extractErrorReason } from '../../api/common'
import { listAllOrganizations } from '../../api/organizations'
import type { OrganizationInfo } from '../../api/types/organizations'
import OrgMembersExplorer from '../../components/OrgMembersExplorer'
import { useT } from '../../i18n'

/** 领导端：组织概览（全部组织，点击成员进入详情页） */
export default function LeaderOrgView() {
  const t = useT()

  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  /** 加载全部组织（force=true 绕过会话缓存，代码要求 5） */
  const loadOrgs = useCallback(
    async (force?: boolean) => {
      setOrgsLoading(true)
      setOrgsError(null)
      try {
        setOrgs(await listAllOrganizations(force))
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
      fromModuleKey="leader_m3"
    />
  )
}