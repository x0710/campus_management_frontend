/** 审批模板相关api*/
import {http} from './http'  // 引入http模块
import {cachedGet} from './cache'  // 引入缓存模块，用于失效缓存

/** 分页相应通用结构 
 * @template T 分页数据类型
 * @param data 分页数据数组
 * @param total 总记录数
 * @param page 当前页码
 * @param page_size 每页记录数
 * @param total_pages 总页数
*/
export interface Paginated<T> {
    data: T[]
    total: number
    page: number
    page_size: number
    total_pages: number
}

/** 审批模板条目（GET /api/approval_templates 数组元素） */
export interface ApprovalTemplate {
    id: number
    code: string
    name: string
    business_type: string
    enabled: boolean
    description: string | null
    created_at: string
    updated_at: string
}

/** 审批模板列表/api/approval/templates 
 * @returns 审批模板列表
*/
export function queryApprovalTemplates() {
    return cachedGet<Paginated<ApprovalTemplate[]>>('/approval_templates')
}


