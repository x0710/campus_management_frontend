/**
 * 党员端「成绩申报」相关常量。
 *
 * 说明：后端尚未提供申报接口，当前【临时】借用请假接口承载申报数据
 * （POST/GET /api/leaves、GET /api/leaves/{id}、PATCH /api/leaves/{id}/cancel、DELETE /api/leaves/{id}）。
 * 因此申报类型暂时映射到请假类型编码（leave_type），「目的地」「家长确认」两个字段按需求隐藏，
 * 但仍需按接口契约提交默认值（空串 / false）。
 * 正式申报接口就绪后，只需替换本文件的映射与 PartyDeclarationView 内的接口调用，页面结构无需改动。
 */
import type { LeaveType } from '../api/types/leaves'

/** 申报类型可选项（临时映射到 leave_type 编码，数组顺序即下拉展示顺序） */
export const DECLARATION_TYPES: LeaveType[] = ['personal', 'sick', 'public', 'other']

/** 默认申报类型（表单初始值，如「学术成果」） */
export const DECLARATION_DEFAULT_TYPE: LeaveType = 'personal'

/** 佐证材料：最多上传文件数 */
export const DECLARATION_EVIDENCE_MAX_COUNT = 5

/** 佐证材料：单个文件最大体积（MB） */
export const DECLARATION_EVIDENCE_MAX_SIZE_MB = 5
