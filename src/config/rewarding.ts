/**
 * 奖学金及补助管理常量集中定义（代码要求 7：常量统一放 config/，便于复用）。
 * 文案走 i18n（rewarding.*），这里只放分页、金额取值范围与输入长度限制。
 */

/** 奖学金及补助列表每页条数（代码要求 12：表格每页最多 100 行） */
export const REWARDING_PAGE_SIZE = 100

/** 奖学金项目名称最大长度（表单输入限制） */
export const REWARDING_PROJECT_MAX_LENGTH = 100

/** 金额下限（元，含 0，可为 0） */
export const REWARDING_AMOUNT_MIN_YUAN = 0

/** 金额上限（元，防止输入溢出后端 int64 分） */
export const REWARDING_AMOUNT_MAX_YUAN = 99999999.99

/** 金额输入步进（元，精确到分） */
export const REWARDING_AMOUNT_STEP_YUAN = 0.01

/** 学生/用户 ID（uid）最小值 */
export const REWARDING_UID_MIN = 0
