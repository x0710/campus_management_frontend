/**
 * 职位管理常量集中定义（代码要求 7：常量统一放 config/，便于复用）。
 * 文案走 i18n（adminPositions.*），这里只放分页与输入长度限制。
 */

/** 职位列表每页条数（代码要求 12：表格每页最多 20 行） */
export const POSITION_PAGE_SIZE = 20

/** 职位编码最大长度（与后端 code 字段约束对齐） */
export const POSITION_CODE_MAX_LENGTH = 64

/** 职位名称最大长度 */
export const POSITION_NAME_MAX_LENGTH = 64

/** 职位描述最大长度 */
export const POSITION_DESC_MAX_LENGTH = 200
