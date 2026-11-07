/**
 * 「批量添加新成员」样表与对照表的 Excel 组装逻辑（可复用，代码要求 1）。
 *
 * 抽成纯函数便于复用与验证：页面只负责拉数据、调用本函数、触发下载，
 * 工作表结构（哪几张表、每张表的列与数据）全部收敛在这里。
 *
 * 输出结构：
 *   1. 新成员：十五列表头 + 第 2 行填写说明 + 两行示例（从第 5 行起填真实数据）；
 *   2. 填写说明：数据起始行、密码必填等通用规则；
 *   3. 组织与ID对应表；
 *   4. 身份与编码对应表；
 *   5. 系统角色与ID对应表。
 * 加载失败的表不会写入工作表，由调用方根据 missing 提示用户。
 */
import type { OrganizationInfo } from '../api/types/organizations'
import type { PositionDetail } from '../api/types/positions'
import type { RoleInfo } from '../api/types/rbac'
import {
  BULK_LOOKUP_SHEET_NAMES,
  BULK_MEMBER_SHEET_NAME,
  BULK_TEMPLATE_COLUMNS,
  BULK_TEMPLATE_GUIDE_SHEET_NAME,
  POSITION_USAGE_SCOPE_LABEL_KEYS,
} from '../config/bulkMembers'
import type { TranslateFn } from '../i18n'
import type { XlsxSheet } from './xlsx'

/**
 * 「填写说明」工作表的行：左列为项目、右列为说明。
 * 文案走 i18n，保证中英文导出都有对应说明。
 */
const GUIDE_ROWS: { labelKey: string; descKey: string }[] = [
  { labelKey: 'bulkMembers.guide.startRowItem', descKey: 'bulkMembers.guide.startRow' },
  { labelKey: 'bulkMembers.guide.exampleItem', descKey: 'bulkMembers.guide.example' },
  { labelKey: 'bulkMembers.guide.passwordItem', descKey: 'bulkMembers.guide.password' },
  { labelKey: 'bulkMembers.guide.orgIdentityItem', descKey: 'bulkMembers.guide.orgIdentity' },
  {
    labelKey: 'bulkMembers.guide.orgIdentityScopeItem',
    descKey: 'bulkMembers.guide.orgIdentityScope',
  },
  { labelKey: 'bulkMembers.guide.rolesItem', descKey: 'bulkMembers.guide.roles' },
  { labelKey: 'bulkMembers.guide.profileItem', descKey: 'bulkMembers.guide.profile' },
  { labelKey: 'bulkMembers.guide.importItem', descKey: 'bulkMembers.guide.import' },
]

/** 组装样表所需的输入 */
export interface MemberTemplateInput {
  /** 翻译函数（必填，来自 useT()） */
  t: TranslateFn
  /** 组织全量数据（必填，可为空数组） */
  orgs: OrganizationInfo[]
  /** 组织 ID → 名称（必填，用于「上级组织」「所属组织」列） */
  orgNameById: Map<number, string>
  /** 身份（职位）全量数据（必填，可为空数组） */
  positions: PositionDetail[]
  /** 系统角色全量数据（必填，可为空数组） */
  roles: RoleInfo[]
}

/** 组装结果 */
export interface MemberTemplateResult {
  /** 交给 downloadXlsx 的工作表数组（必填，至少含「新成员」） */
  sheets: XlsxSheet[]
  /** 因数据未加载而未写入的对照表名称（必填，空数组表示全部写入） */
  missing: string[]
}

/**
 * 组装「新成员 + 填写说明 + 三张对照表」的工作表数组。
 * @param input 见 MemberTemplateInput（必填）
 * @returns MemberTemplateResult 工作表与缺失表名
 */
export function buildMemberTemplateSheets(input: MemberTemplateInput): MemberTemplateResult {
  const { t, orgs, orgNameById, positions, roles } = input

  const sheets: XlsxSheet[] = [
    {
      name: BULK_MEMBER_SHEET_NAME,
      columns: BULK_TEMPLATE_COLUMNS.map((col) => ({
        header: t(col.labelKey),
        width: col.excelWidth,
      })),
      rows: [
        // 第 2 行为填写说明，与第 3–4 行示例一起由导入程序自动跳过
        BULK_TEMPLATE_COLUMNS.map((col) => t(col.descKey)),
        BULK_TEMPLATE_COLUMNS.map((col) => col.sampleA),
        BULK_TEMPLATE_COLUMNS.map((col) => col.sampleB),
      ],
      rowHeights: { 2: 96 },
    },
    {
      // 通用填写规则（第 5 行起填、密码必填等），放在第 2 张表便于用户先看到
      name: BULK_TEMPLATE_GUIDE_SHEET_NAME,
      columns: [
        { header: t('bulkMembers.guide.colItem'), width: 18 },
        { header: t('bulkMembers.guide.colDesc'), width: 96 },
      ],
      rows: GUIDE_ROWS.map((row) => [t(row.labelKey), t(row.descKey)]),
    },
  ]

  const missing: string[] = []

  if (orgs.length > 0) {
    sheets.push({
      name: BULK_LOOKUP_SHEET_NAMES.orgs,
      columns: [
        { header: t('bulkMembers.col.orgId'), width: 10 },
        { header: t('bulkMembers.col.orgCode'), width: 22 },
        { header: t('bulkMembers.col.orgName'), width: 34 },
        { header: t('bulkMembers.col.orgParent'), width: 30 },
      ],
      rows: orgs.map((org) => [
        org.id,
        org.code,
        org.name,
        org.parent_id === null ? '' : (orgNameById.get(org.parent_id) ?? org.parent_id),
      ]),
    })
  } else {
    missing.push(t('bulkMembers.orgTitle'))
  }

  if (positions.length > 0) {
    sheets.push({
      name: BULK_LOOKUP_SHEET_NAMES.positions,
      columns: [
        { header: t('bulkMembers.col.posCode'), width: 24 },
        { header: t('bulkMembers.col.posName'), width: 22 },
        { header: t('bulkMembers.col.posOrg'), width: 30 },
        { header: t('bulkMembers.col.posScope'), width: 22 },
        { header: t('bulkMembers.col.posDesc'), width: 46 },
      ],
      rows: positions.map((position) => [
        position.code,
        position.name,
        orgNameById.get(position.organization_id) ?? position.organization_id,
        t(
          POSITION_USAGE_SCOPE_LABEL_KEYS[position.usage_scope] ??
            'bulkMembers.scopeSelfOnly',
        ),
        position.description ?? '',
      ]),
    })
  } else {
    missing.push(t('bulkMembers.posTitle'))
  }

  if (roles.length > 0) {
    sheets.push({
      name: BULK_LOOKUP_SHEET_NAMES.roles,
      columns: [
        { header: t('bulkMembers.col.roleId'), width: 10 },
        { header: t('bulkMembers.col.roleName'), width: 22 },
        { header: t('bulkMembers.col.roleCode'), width: 26 },
        { header: t('bulkMembers.col.roleDesc'), width: 40 },
      ],
      rows: roles.map((role) => [role.id, role.name, role.code, role.description ?? '']),
    })
  } else {
    missing.push(t('bulkMembers.roleTitle'))
  }

  return { sheets, missing }
}
