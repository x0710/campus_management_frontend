/**
 * 当前登录用户身份解析 Hook（真实姓名 + 所属组织）。
 * 供党员端「首页」「我的档案」等展示本人身份的场景复用，避免各页面重复请求。
 *
 * 数据来源（均走会话内缓存 cachedGet，重复进入页面不产生额外网络请求；
 * 退出登录时由 invalidate() 统一清空，避免下一个用户读到上一位用户的资料）：
 *   GET /api/users/me                            当前用户真实姓名 name（仅需登录，无需 user.read）
 *   GET /api/credentials/me                      当前用户 uid（仅需登录）
 *   GET /api/organization-members?uids={uid}     该用户全部任职组织名称（organization_name）
 *
 * 容错：任一接口失败仅影响对应字段（姓名回退 null、组织回退空数组），不阻塞页面其余内容。
 */
import { useEffect, useState } from 'react'
import { getCurrentUser } from '../api/auth'
import { listUserOrganizations } from '../api/organizations'
import { getMyProfile } from '../api/users'

/** 当前登录用户身份解析结果 */
export interface CurrentIdentity {
  /** 真实姓名（可能为 null：接口未返回或查询失败，由调用方决定兜底展示） */
  name: string | null
  /** 所属组织名称列表（可能为空数组；同一用户多处任职时含多项，按名称去重） */
  organizations: string[]
  /** 是否仍在解析中（true 表示数据尚未就绪） */
  loading: boolean
}

/**
 * 解析当前登录用户的真实姓名与所属组织。
 *
 * @returns CurrentIdentity 身份解析结果
 *   - name：真实姓名（string | null）
 *   - organizations：组织名称数组（string[]，可能为空）
 *   - loading：是否仍在解析（boolean）
 */
export function useCurrentIdentity(): CurrentIdentity {
  const [state, setState] = useState<CurrentIdentity>({
    name: null,
    organizations: [],
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      // 姓名（仅需登录）与 uid 并行获取，单个失败不影响另一个
      const [profile, me] = await Promise.all([
        getMyProfile().catch(() => null),
        getCurrentUser().catch(() => null),
      ])

      // uid 就绪后再取任职组织；同一用户多任职时按组织名称去重
      let organizations: string[] = []
      if (me) {
        try {
          const userOrgs = await listUserOrganizations(me.uid)
          organizations = [...new Set(userOrgs.map((o) => o.organization_name).filter(Boolean))]
        } catch {
          // 组织查询失败：保持空数组，不影响姓名展示
        }
      }

      if (!cancelled) {
        setState({ name: profile?.name ?? null, organizations, loading: false })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
