/**
 * 「批量添加新成员」辅助页常量：对照表分页、样表列定义、示例数据与导出文件名。
 *
 * 该页由党委学校端「组织成员管理」左侧组织树的「批量添加新成员」按钮进入，
 * 页内用一处切换器在「组织与 ID」「身份（职位）与编码」「系统角色与 ID」「样表说明」之间切换，
 * 同一时间只展示一张表；下载的样表会把三张对照表与填写说明一并写进同一份 Excel。
 * 页面本体见 pages/admin/BulkAddMembersView.tsx。
 */

import type { PositionUsageScope } from '../api/types/positions'

/** 对照表每页条数（代码要求 12：表格每页最多 100 行） */
export const BULK_MAPPING_PAGE_SIZE = 100

/**
 * 回退分片流水线每片的行数（每片先建号，再立刻同步该片全部信息）。
 * 实测 50 行建号约 500ms，但组织任职等批量写请求在并发/重复导入时容易触达 15 秒超时；
 * 按 20 行分片可以缩短单个事务的持锁时间，降低超时与整批回滚的概率。
 */
export const BULK_ACCOUNT_CREATE_BATCH_SIZE = 20

/**
 * 批量查询类 GET 的 UID 分片大小。
 * `uids=1,2,3…` 会拼进 URL（请求行），数据量大时可能触发 431 / 414；
 * 100 个 UID 约 1KB，远低于常见的 8KB 代理限制。
 */
export const BULK_UID_QUERY_BATCH_SIZE = 100

/**
 * 批量写入请求的初始最大条数与降级阶梯：1000 → 100 → 10 → 1。
 * 请求过大（413 / 414 / 431）或单项数据问题时自动缩小批量重试，避免整批失败。
 */
export const BULK_WRITE_BATCH_TIERS = [1000, 100, 10, 1] as const

/**
 * 批量导入阶段是否跳过读取（临时测试用）。
 *
 * 导入不是纯写入：角色要合并、组织任职要做差集、党员档案要区分创建/更新，
 * 所以正常流程会先 GET 现状。这里按「前端只写不读」的思路临时关闭导入阶段的 4 个 GET，
 * 方便验证影响；需要恢复某一类读取时，把对应值改成 false 即可，不用改业务代码。
 *
 * 风险（测试前请确认使用的是测试数据）：
 * - roles：没有已有角色可合并，写入角色时会覆盖账号原有默认角色；
 * - organizations：只新增表格里的任职，不删除系统里多出来的任职；
 * - partyProfiles：已有党员档案的账号会再次创建档案，可能返回冲突；
 * - existingUsers：所有行先按新账号创建，已存在账号靠 409 兜底，建号请求会明显变多。
 */
export const BULK_IMPORT_SKIP_READS: {
  existingUsers: boolean
  roles: boolean
  organizations: boolean
  partyProfiles: boolean
} = {
  existingUsers: true,
  roles: true,
  organizations: true,
  partyProfiles: true,
}

/**
 * 身份（职位）适用范围 → i18n 文案 key。
 * 「组织:身份」只有在职位已向目标组织开放时才合法，模板与页面均需展示该范围。
 */
export const POSITION_USAGE_SCOPE_LABEL_KEYS: Record<PositionUsageScope, string> = {
  self_only: 'bulkMembers.scopeSelfOnly',
  self_and_children: 'bulkMembers.scopeSelfAndChildren',
  self_and_descendants: 'bulkMembers.scopeSelfAndDescendants',
}

/** 批量添加新成员页的子路由路径（相对 /portal/:portalKey/） */
export const BULK_ADD_MEMBERS_ROUTE = 'bulk-add-members'

/** 下载的样表文件名 */
export const BULK_MEMBER_TEMPLATE_FILE_NAME = '批量添加新成员模板.xlsx'

/** 样表里「新成员」工作表的名称（导入分析时按该名称优先定位） */
export const BULK_MEMBER_SHEET_NAME = '新成员'

/** 样表里「填写说明」工作表的名称 */
export const BULK_TEMPLATE_GUIDE_SHEET_NAME = '填写说明'

/**
 * 导入分析从第几行开始读数据（1 基）。
 * 样表固定为：第 1 行表头、第 2 行填写说明、第 3–4 行示例，第 5 行起是真实数据。
 */
export const BULK_DATA_START_ROW = 5

/** 导入分析只接受 .xlsx 文件 */
export const BULK_IMPORT_EXTENSION = '.xlsx'

/** 导出时三张对照表各自的工作表名称（Excel 工作表名限制 31 字符） */
export const BULK_LOOKUP_SHEET_NAMES = {
  orgs: '组织与ID对应表',
  positions: '身份与编码对应表',
  roles: '系统角色与ID对应表',
} as const

/** 对照表页签标识 */
export type BulkLookupKey = 'orgs' | 'positions' | 'roles'

/** 样表列定义（顺序即 Excel 从左到右的列顺序） */
export interface BulkTemplateColumn {
  /** 列标识（同时用于表格 key） */
  key: string
  /** 列名的 i18n key */
  labelKey: string
  /** 填写说明的 i18n key（也用作导出样表第 2 行的说明） */
  descKey: string
  /** 是否必填 */
  required: boolean
  /** 示例行 1 的单元格内容（李同学） */
  sampleA: string
  /** 示例行 2 的单元格内容（王同学） */
  sampleB: string
  /** 导出 Excel 时的列宽（字符数） */
  excelWidth: number
}

/**
 * 样表十四列：与「添加新成员列表.xlsx」表头逐列对应。
 * 示例值取自样表本身，便于用户照抄格式；「系统角色」只写角色 ID 数字，不写角色名称。
 * 登录账号名与初始密码相邻放在前两列，便于成对填写与核对账号凭证。
 * 后四列（民族 / 籍贯 / 户口所在地 / 户口性质）为可选项，导入时写入该账号的个人档案（没有档案会自动创建）。
 */
export const BULK_TEMPLATE_COLUMNS: BulkTemplateColumn[] = [
  {
    key: 'username',
    labelKey: 'bulkMembers.col.username',
    descKey: 'bulkMembers.colDesc.username',
    required: true,
    sampleA: '1234567890',
    sampleB: '4567891230',
    excelWidth: 22,
  },

  {
    key: 'name',
    labelKey: 'adminUsers.fieldName',
    descKey: 'bulkMembers.colDesc.name',
    required: true,
    sampleA: '李同学',
    sampleB: '王同学',
    excelWidth: 12,
  },
  {
    key: 'gender',
    labelKey: 'adminUsers.fieldGender',
    descKey: 'bulkMembers.colDesc.gender',
    required: false,
    sampleA: '男',
    sampleB: '女',
    excelWidth: 8,
  },
  {
    key: 'orgIdentity',
    labelKey: 'bulkMembers.col.orgIdentity',
    descKey: 'bulkMembers.colDesc.orgIdentity',
    required: true,
    sampleA: '1198：ZGDY',
    sampleB: '1198：ZGDY/ZBSJ；1067：SJ',
    excelWidth: 34,
  },
  {
    key: 'partyNo',
    labelKey: 'bulkMembers.col.partyNo',
    descKey: 'bulkMembers.colDesc.partyNo',
    required: false,
    sampleA: '123456',
    sampleB: '456789',
    excelWidth: 12,
  },
  {
    key: 'joinTime',
    labelKey: 'bulkMembers.col.joinTime',
    descKey: 'bulkMembers.colDesc.joinTime',
    required: false,
    sampleA: '2025-10-01',
    sampleB: '2024-10-01',
    excelWidth: 14,
  },
  {
    key: 'phone',
    labelKey: 'adminUsers.fieldPhone',
    descKey: 'bulkMembers.colDesc.phone',
    required: false,
    sampleA: '17562489654',
    sampleB: '15945628569',
    excelWidth: 16,
  },
  {
    key: 'email',
    labelKey: 'adminUsers.fieldEmail',
    descKey: 'bulkMembers.colDesc.email',
    required: false,
    sampleA: '123@qq.com',
    sampleB: '456@qq.com',
    excelWidth: 20,
  },
  {
    key: 'birthday',
    labelKey: 'adminUsers.fieldBirthday',
    descKey: 'bulkMembers.colDesc.birthday',
    required: false,
    sampleA: '2000-10-01',
    sampleB: '2000-10-01',
    excelWidth: 14,
  },
  {
    key: 'roles',
    labelKey: 'adminUsers.fieldRoles',
    descKey: 'bulkMembers.colDesc.roles',
    required: false,
    sampleA: '15/14',
    sampleB: '15',
    excelWidth: 18,
  },
  {
    key: 'ethnic',
    labelKey: 'bulkMembers.col.ethnic',
    descKey: 'bulkMembers.colDesc.ethnic',
    required: false,
    sampleA: '苗族',
    sampleB: '回族',
    excelWidth: 12,
  },
  {
    key: 'nativePlace',
    labelKey: 'bulkMembers.col.nativePlace',
    descKey: 'bulkMembers.colDesc.nativePlace',
    required: false,
    sampleA: '贵州黔东南',
    sampleB: '宁夏银川',
    excelWidth: 18,
  },
  {
    key: 'householdLocation',
    labelKey: 'bulkMembers.col.householdLocation',
    descKey: 'bulkMembers.colDesc.householdLocation',
    required: false,
    sampleA: '贵州省凯里市幸福路 12 号',
    sampleB: '宁夏银川市金凤区团结路 45 号',
    excelWidth: 30,
  },
  {
    key: 'householdType',
    labelKey: 'bulkMembers.col.householdType',
    descKey: 'bulkMembers.colDesc.householdType',
    required: false,
    sampleA: '城镇',
    sampleB: '农村',
    excelWidth: 12,
  },
]

/**
 * 样表填写规则的示例文案（「组织:身份」列的多身份 / 多组织写法）。
 * 与样表第 2 行说明一致，抽取为常量便于页面与模板复用。
 */
export const BULK_ORG_IDENTITY_EXAMPLE = '1198：ZGDY/ZBSJ；1067：SJ'

/** 样表中「系统角色」列的多角色写法示例（只写角色 ID 数字） */
export const BULK_ROLE_EXAMPLE = '15/14'
