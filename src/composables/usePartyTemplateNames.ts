/**
 * 党建成绩申报模板名称 Hook（党员端首页 / 申报详情页共用）。
 *
 * 通过 GET /api/approvals/templates 按党建业务类型（PARTY_TEMPLATE_BUSINESS_TYPE）
 * 拉取启用中的模板，生成「模板 ID → 名称」映射；取不到时返回空 Map，
 * 调用方回退展示模板 ID，不影响页面主体内容。
 */
import { useEffect, useState } from 'react'
import { queryApprovalTemplates } from '../api/approvalmodel'
import {
  PARTY_DECLARATION_PAGE_SIZE,
  PARTY_TEMPLATE_BUSINESS_TYPE,
} from '../config/partyDeclaration'

/**
 * 获取党建申报模板名称映射。
 *
 * @param force 是否绕过会话缓存重新请求（可选，默认 false；手动刷新时传 true）
 * @returns Map<模板 ID, 模板名称>（必返回；加载中或失败时为空 Map）
 */
export function usePartyTemplateNames(force = false): Map<number, string> {
  const [names, setNames] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    queryApprovalTemplates(
      {
        business_type: PARTY_TEMPLATE_BUSINESS_TYPE,
        enabled: true,
        page: 1,
        page_size: PARTY_DECLARATION_PAGE_SIZE,
      },
      force,
    )
      .then((res) => {
        if (!cancelled) {
          setNames(new Map(res.data.map((item) => [item.id, item.name])))
        }
      })
      .catch(() => {
        /* 名称取不到时由调用方回退展示模板 ID */
      })
    return () => {
      cancelled = true
    }
  }, [force])

  return names
}
