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

/** 「我的-消息通知」单页条数（代码要求 12：单页最多 100 条） */
export const PARTY_NOTICE_PAGE_SIZE = 10

/** 先锋指数基础分（总分在该基础上自动累加） */
export const PARTY_SCORE_BASE = 70

/** 加分项展示上限（后端记录加总超过该值时按该值展示） */
export const PARTY_SCORE_MAX_BONUS = 30

/** 先锋指数总分展示上限 */
export const PARTY_SCORE_MAX_TOTAL = 100

/** 当前减分项固定值（后端暂无减分计算，先固定为 0） */
export const PARTY_SCORE_DEDUCTION = 0

/** 先锋指数等级分数线：总分 ≥ 该值即进入对应等级（先锋 ≥ 90 / 示范 ≥ 80 / 进位 ≥ 70，其余为警示） */
export const PARTY_GRADE_PIONEER_MIN = 90
export const PARTY_GRADE_DEMONSTRATION_MIN = 80
export const PARTY_GRADE_PROGRESS_MIN = 70
