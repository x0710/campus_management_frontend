/**
 * 党员端「成绩申报」相关常量（代码要求 7：常量集中管理）。
 *
 * 申报数据对接后端党建活动加分接口（/api/party-scores）：创建加分申请需要 template_id，
 * 因此页面「申报类型」取自审批模板（GET /api/approvals/templates）。
 * 这里限定只取业务类型为 PARTY_TEMPLATE_BUSINESS_TYPE 的模板，过滤掉与成绩申报无关的其他模板。
 */

/** 成绩申报对应的审批模板业务类型（api.json: ApprovalTemplate.business_type） */
export const PARTY_TEMPLATE_BUSINESS_TYPE = 'party'

/** 申报记录每页条数（代码要求 12：表格单页最多 100 行） */
export const PARTY_DECLARATION_PAGE_SIZE = 100

/** 单次申报最多可上传的附件数量 */
export const PARTY_DECLARATION_MAX_FILES = 10

/** 党员端首页「近期记录」展示条数（取最近的若干条成绩申报） */
export const PARTY_RECENT_RECORD_LIMIT = 5
