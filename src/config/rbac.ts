/**
 * RBAC（角色权限）模块常量集中定义（代码要求 7：常量统一放 config/，便于复用）。
 * 数据范围选项的 value 与后端 campus_common::data_scope::DataScope 的 snake_case 序列化保持一致；
 * 文案（label / 提示）走 i18n，本文件只维护取值与映射关系。
 */
import type { DataScope } from '../api/types/rbac'

/** 数据范围下拉选项：value 为提交后端的枚举值，labelKey / descKey 为 i18n key */
export interface DataScopeOption {
  /** 提交给后端的数据范围枚举值 */
  value: DataScope
  /** 选项名称的 i18n key */
  labelKey: string
  /** 选项说明（悬停提示）的 i18n key */
  descKey: string
}

/**
 * 全部数据范围选项，顺序与后端 DataScope 枚举一致（从宽到窄）。
 * 用于角色数据范围配置弹窗的下拉框，悬停选项时展示 descKey 对应的说明（代码要求 10）。
 */
export const DATA_SCOPE_OPTIONS: DataScopeOption[] = [
  { value: 'all', labelKey: 'adminRoles.scopeAll', descKey: 'adminRoles.scopeAllDesc' },
  {
    value: 'self_only',
    labelKey: 'adminRoles.scopeSelfOnly',
    descKey: 'adminRoles.scopeSelfOnlyDesc',
  },
  { value: 'org', labelKey: 'adminRoles.scopeOrg', descKey: 'adminRoles.scopeOrgDesc' },
  {
    value: 'org_and_child',
    labelKey: 'adminRoles.scopeOrgAndChild',
    descKey: 'adminRoles.scopeOrgAndChildDesc',
  },
  { value: 'custom', labelKey: 'adminRoles.scopeCustom', descKey: 'adminRoles.scopeCustomDesc' },
]

/** 角色数据范围配置最大行数（代码要求 12：表格每页最多 100 行） */
export const RBAC_DATA_SCOPE_MAX_ROWS = 100

/** 数据范围「资源」字段最大长度 */
export const RBAC_DATA_SCOPE_RESOURCE_MAX_LENGTH = 64

/** 数据范围「自定义组织 ID」字段最大长度 */
export const RBAC_DATA_SCOPE_VALUE_MAX_LENGTH = 200