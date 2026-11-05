import type { PositionUsageScope } from '../api/types/positions'

/**
 * 职位管理常量集中定义（代码要求 7：常量统一放 config/，便于复用）。
 * 文案走 i18n（adminPositions.*），维护分页、输入长度限制与适用范围选项。
 */

/** 职位列表每页条数（代码要求 12：表格每页最多 100 行） */
export const POSITION_PAGE_SIZE = 100

/** 职位编码最大长度（与后端 code 字段约束对齐） */
export const POSITION_CODE_MAX_LENGTH = 64

/** 职位名称最大长度 */
export const POSITION_NAME_MAX_LENGTH = 64

/** 职位描述最大长度 */
export const POSITION_DESC_MAX_LENGTH = 200

/** 创建、编辑、列表与详情共用，避免新范围被误显示为「仅本组织」。 */
export const POSITION_USAGE_SCOPE_LABEL_KEYS: Record<PositionUsageScope, string> = {
  self_only: 'adminPositions.scopeSelfOnly',
  self_and_children: 'adminPositions.scopeSelfAndChildren',
  self_and_descendants: 'adminPositions.scopeSelfAndDescendants',
}
