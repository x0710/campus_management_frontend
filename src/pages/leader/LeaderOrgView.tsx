/**
 * 领导端：组织概览（只读展示行政组织树 + 成员表）。
 *
 * 本页只负责加载「全部组织」（GET /api/organizations 分页循环取满，见 listAllOrganizations），
 * 组织树、成员分页查询与「双击成员进入详情页」等交互统一复用公共组件 OrgMembersExplorer
 * （同一组件也被老师端「班级管理」复用，代码要求 1）。
 *
 * 领导端不看党建组织：默认排除「学院党委」容器（SCHOOL_COLLEGE_PARENT_ORG_ID）
 * 及其全部下级组织，仅保留行政组织树。
 *
 * 交互（代码要求 14）：双击成员行跳转到「成员详情」页（成绩/请假/违规信息），
 * 携带 ?from=leader_m3 使侧栏仍高亮本模块。
 */
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractErrorReason } from '../../api/common'
import { listAllOrganizations } from '../../api/organizations'
import type { OrganizationInfo } from '../../api/types/organizations'
import OrgMembersExplorer from '../../components/OrgMembersExplorer'
import { SCHOOL_COLLEGE_PARENT_ORG_ID } from '../../config/organization'
import { useT } from '../../i18n'
import { listOrgDescendantIds } from '../../utils/orgTree'

/**
 * 领导端：组织概览（全部组织，双击成员进入详情页）
 * @returns 类型：Element
 */
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

  /**
   * 领导端默认不展示「学院党委」相关内容：
   * 按 SCHOOL_COLLEGE_PARENT_ORG_ID 找到该容器，连同其全部下级组织一起排除。
   */
  const visibleOrgs = useMemo(() => {
    const excluded = new Set<number>([
      SCHOOL_COLLEGE_PARENT_ORG_ID,
      ...listOrgDescendantIds(orgs, SCHOOL_COLLEGE_PARENT_ORG_ID),
    ])
    return orgs.filter((org) => !excluded.has(org.id))
  }, [orgs])

  return (
    <OrgMembersExplorer
      orgs={visibleOrgs}
      orgsLoading={orgsLoading}
      orgsError={orgsError}
      onReloadOrgs={(force?: boolean) => void loadOrgs(force)}
      fromModuleKey="leader_m3"
      // 批量添加成员：复用党建项目同一页面，项目差异由 config/bulkImportProfile 控制
      showBulkAdd
    />
  )
}
