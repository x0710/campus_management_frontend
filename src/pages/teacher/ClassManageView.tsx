/**
 * 老师端：班级管理（展示本人所在组织的全部人员，点击成员可查看学生详细信息）。
 *
 * 数据来源：当前登录用户 uid（GET /api/credentials/me，会话缓存）
 *   → 本人全部组织任职（GET /api/organizations/users/{uid}，会话缓存）
 *   → 所选组织成员（GET /api/organizations/{id}/members，复用 OrgMembersExplorer 内分页查询）。
 * 本页不提供任何组织/成员范围输入，只用登录态解析出的组织，因此老师只能看到本人所在组织的人员；
 * 后端对成员查询另有数据权限校验，越权会返回 403（错误提示含状态码与中文原因）。
 *
 * 复用说明（代码要求 1）：组织树 + 成员表 + 成员详情跳转全部复用公共组件 OrgMembersExplorer；
 * 成员详情页复用领导端 MemberDetailPage，经 ?from=teacher_m3 让侧栏高亮本模块，
 * 并在该来源下隐藏成绩/违规编辑入口（老师端为只读查询，见 MEMBER_DETAIL_READONLY_FROM_MODULES）。
 */
import { Alert } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser } from '../../api/auth'
import { extractErrorReason } from '../../api/common'
import { listUserOrganizations } from '../../api/organizations'
import type { OrgNode } from '../../components/OrgMembersExplorer'
import OrgMembersExplorer from '../../components/OrgMembersExplorer'
import { useT } from '../../i18n'

export default function ClassManageView() {
  const t = useT()

  const [orgs, setOrgs] = useState<OrgNode[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  /** 加载本人所在组织（老师端数据范围来源；会话缓存） */
  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true)
    setOrgsError(null)
    try {
      const me = await getCurrentUser()
      const list = await listUserOrganizations(me.uid)
      // 只取展示所需字段：组织树按名称/编码渲染，老师端无上级组织信息不建父子关系
      setOrgs(list.map((o) => ({ id: o.organization_id, name: o.organization_name })))
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
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        title={t('teacherClass.scopeHint')}
      />
      <OrgMembersExplorer
        orgs={orgs}
        orgsLoading={orgsLoading}
        orgsError={orgsError}
        /* 组织接口暂不支持 force（走会话缓存），成员列表的强制刷新在组件内完成 */
        onReloadOrgs={() => void loadOrgs()}
        fromModuleKey="teacher_m3"
        autoSelectFirst
      />
    </>
  )
}