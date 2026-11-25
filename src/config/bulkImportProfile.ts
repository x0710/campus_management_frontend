/**
 * 「批量添加新成员」的项目差异配置（代码要求 1 / 2）。
 *
 * 党建项目（party）与校园项目（campus）共用同一个页面与同一条导入流水线，
 * 但两个项目在样表列、组织范围、校验与导入实现上后续可能不同。
 * 所有差异集中在本文件，页面只读取配置，不感知项目：
 * - columns：样表列（当前两个项目一致，后续可各自裁剪 / 扩展）；
 * - defaultModuleKey：直接访问页面（无 ?from）时返回 / 侧栏高亮的目标模块；
 * - excludeOrgRootIds：组织对照表需要排除的根组织（连同全部下级）；
 * - analyzeRows / importRows：样表校验与导入提交实现，缺省沿用党建项目现有实现。
 *
 * 党建项目的配置保持与改动前完全一致，不影响既有功能。
 */
import { analyzeMemberRows } from '../utils/bulkMemberCheck'
import { importMemberRows } from '../utils/bulkMemberImport'
import { PROJECT_KEY } from '../projects'
import { BULK_TEMPLATE_COLUMNS, type BulkTemplateColumn } from './bulkMembers'
import { SCHOOL_COLLEGE_PARENT_ORG_ID, SCHOOL_ORG_ADMIN_MODULE_KEY } from './organization'

/** 批量添加成员的项目差异配置 */
export interface BulkImportProfile {
  /** 样表列定义（顺序即 Excel 从左到右的列顺序） */
  columns: BulkTemplateColumn[]
  /** 无 ?from 时返回按钮与侧栏高亮使用的模块 key */
  defaultModuleKey: string
  /** 组织对照表需要排除的根组织 ID（连同全部下级） */
  excludeOrgRootIds: number[]
  /** 样表校验实现（默认 14 列党建样表校验） */
  analyzeRows: typeof analyzeMemberRows
  /** 导入提交实现（默认统一党员档案导入） */
  importRows: typeof importMemberRows
}

/** 党建项目：保持原有行为（全部组织、14 列党建样表、统一导入） */
const PARTY_PROFILE: Omit<BulkImportProfile, 'defaultModuleKey'> = {
  columns: BULK_TEMPLATE_COLUMNS,
  excludeOrgRootIds: [],
  analyzeRows: analyzeMemberRows,
  importRows: importMemberRows,
}

/** 校园项目：当前样表与党建一致，预留按门户裁剪列 / 替换校验与导入实现的空间 */
const CAMPUS_PROFILE: Omit<BulkImportProfile, 'defaultModuleKey' | 'excludeOrgRootIds'> = {
  columns: BULK_TEMPLATE_COLUMNS,
  analyzeRows: analyzeMemberRows,
  importRows: importMemberRows,
}

/** 各门户默认来源模块（无 ?from 时使用） */
const PARTY_MODULE_KEYS: Record<string, string> = {
  branch: 'branch_m5',
  academy: 'academy_m5',
}

const CAMPUS_MODULE_KEYS: Record<string, string> = {
  leader: 'leader_m3',
  admin: 'admin_m3',
}

/**
 * 取当前项目、当前门户的批量导入配置。
 * @param portalKey 当前门户 key（必填，如 branch / academy / school / leader）
 * @returns 该门户的导入配置（列、默认来源模块、排除组织与实现）
 */
export function getBulkImportProfile(portalKey: string): BulkImportProfile {
  const isCampus = PROJECT_KEY === 'campus'
  const base = isCampus ? CAMPUS_PROFILE : PARTY_PROFILE
  const moduleKeys = isCampus ? CAMPUS_MODULE_KEYS : PARTY_MODULE_KEYS
  return {
    ...base,
    defaultModuleKey: moduleKeys[portalKey] ?? SCHOOL_ORG_ADMIN_MODULE_KEY,
    // 领导端与组织概览保持一致：不展示「学院党委」及其下级
    excludeOrgRootIds:
      isCampus && portalKey === 'leader' ? [SCHOOL_COLLEGE_PARENT_ORG_ID] : [],
  }
}
