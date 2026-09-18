/**
 * 解析指定用户所在组织内的全体成员（教师端「学生成绩」的数据范围来源）。
 *
 * 流程：
 *   uid → GET /organizations/users/{uid}        拿到该用户的所有任职组织
 *       → GET /organizations/{id}/members       逐组织分页拉取**全部**成员（不按职位筛选）
 *       → 得到成员列表（同一成员跨多个组织时保留多条任职记录）
 *
 * 数据范围说明：受限于后端查询能力，暂不对成员做学生/非学生区分，
 * 组织内成员默认视为可查看成绩的对象；后续如需精确限制学生范围再补参与过滤。
 *
 * 所有请求走会话内缓存 cachedGet，重复进入页面不会产生额外网络请求；
 * refresh() 会绕过成员缓存强制重新拉取。
 *
 * 返回：
 *   orgs     —— 老师所在的所有组织（id/name 去重），供筛选下拉使用
 *   students —— 成员任职记录（uid + 所在组织），同一成员在多个组织下会各有一条，
 *               便于按组织精确筛选
 */
import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { extractError } from '../api/common'
import { listUserOrganizations, queryOrgMembers } from '../api/organizations'
import { ORG_MEMBER_FETCH_PAGE_SIZE } from '../config/examination'

/** 组织内的学生（uid + 所属组织信息，用于列表展示与筛选） */
export interface OrgStudent {
  uid: number
  organizationId: number
  organizationName: string
}

/** 老师所在组织（用于筛选下拉） */
export interface TeacherOrg {
  id: number
  name: string
}

interface OrgStudentsState {
  orgs: TeacherOrg[]
  students: OrgStudent[]
  loading: boolean
  /** 错误码：'network' / 'failed' / 后端返回的文本（含状态码由 extractError 提取） */
  error: string | null
}

export function useOrgStudents(uid: number | null) {
  const [state, setState] = useState<OrgStudentsState>({
    orgs: [],
    students: [],
    loading: false,
    error: null,
  })
  const [reloadKey, setReloadKey] = useState(0)
  // 手动刷新标记：refresh() 置位，effect 消费后立即复位
  const forceRef = useRef(false)

  useEffect(() => {
    if (uid === null) {
      setState({ orgs: [], students: [], loading: false, error: null })
      return
    }

    let cancelled = false
    const force = forceRef.current
    forceRef.current = false
    setState((s) => ({ ...s, loading: true, error: null }))

    void (async () => {
      try {
        const orgs = await listUserOrganizations(uid)

        const teacherOrgs = orgs.map((o) => ({ id: o.organization_id, name: o.organization_name }))

        // 逐组织分页拉取全部成员（不按职位筛选）；
        // 同一成员跨多个组织时保留多条任职记录（按「组织+用户」去重，避免翻页重复）
        const rowMap = new Map<string, OrgStudent>()
        for (const org of orgs) {
          for (let page = 1; ; page += 1) {
            const res = await queryOrgMembers(
              org.organization_id,
              { page, page_size: ORG_MEMBER_FETCH_PAGE_SIZE },
              force,
            )
            for (const member of res.data) {
              // 排除老师本人，避免自己的账号出现在成绩列表中
              if (member.user_id === uid) continue
              const key = `${org.organization_id}:${member.user_id}`
              if (!rowMap.has(key)) {
                rowMap.set(key, {
                  uid: member.user_id,
                  organizationId: org.organization_id,
                  organizationName: org.organization_name,
                })
              }
            }
            if (page >= res.total_pages) break
          }
        }
        if (!cancelled) {
          setState({
            orgs: teacherOrgs,
            students: [...rowMap.values()],
            loading: false,
            error: null,
          })
        }
      } catch (err) {
        if (cancelled) return
        // 401 由全局拦截器处理登录态，这里不重复提示
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          setState((s) => ({ ...s, loading: false }))
          return
        }
        setState({ orgs: [], students: [], loading: false, error: extractError(err) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [uid, reloadKey])

  const refresh = useCallback(() => {
    forceRef.current = true
    setReloadKey((k) => k + 1)
  }, [])

  return { ...state, refresh }
}
