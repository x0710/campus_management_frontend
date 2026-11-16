/**
 * 审批指标（审批模板）导出：
 * 1. 指标列表按分页取全（后端无按 ID 批量查询，单页上限 100；
 *    全量拉取由 api/approvalmodel.ts 的 listAllApprovalTemplates 完成）；
 * 2. 审批步骤只能逐条调用详情接口补全（后端没有批量详情接口），此处限制并发；
 * 3. 组织名称与审批人角色名称批量解析，失败时回退展示原始 ID / 编码。
 */
import { getApprovalTemplateDetail } from '../api/approvalmodel'
import { getOrganization } from '../api/organizations'
import { listAllPositions } from '../api/positions'
import { resolveUserNames } from '../api/userNames'
import type { ApprovalTemplate } from '../api/types/approvalmodel'
import { getBusinessTypeLabel } from '../config/approvalTemplate'
import type { TranslateFn } from '../i18n'
import type { Locale } from '../types/locale'
import { formatDateTime } from './datetime'
import { mapInBatches } from './mapInBatches'
import { downloadXlsx, type XlsxSheet } from './xlsx'

/** 详情 / 组织名称查询的并发上限，避免一次性发出过多请求 */
const EXPORT_CONCURRENCY = 5

/** 导出参数 */
export interface ApprovalTemplateExportOptions {
  /** 当前语言（用于日期格式化） */
  locale: Locale
  /** 翻译函数 */
  t: TranslateFn
  /** 下载文件名（含 .xlsx 后缀） */
  fileName: string
}

/** 导出结果 */
export interface ApprovalTemplateExportResult {
  /** 导出的指标条数 */
  metricCount: number
  /** 导出的审批步骤条数 */
  stepCount: number
}

/**
 * 导出指标信息与审批步骤为 xlsx（两张工作表）。
 * @param rows 需要导出的指标行（调用方已完成筛选与排序，必填）
 * @param options 导出参数（必填）
 * @returns Promise<ApprovalTemplateExportResult> 导出的指标与步骤条数
 */
export async function exportApprovalTemplatesXlsx(
  rows: readonly ApprovalTemplate[],
  options: ApprovalTemplateExportOptions,
): Promise<ApprovalTemplateExportResult> {
  const { locale, t, fileName } = options

  // 组织名称按去重后的组织 ID 查询（权限与指标列表一致，失败回退 #ID）
  const organizationIds = Array.from(new Set(rows.map((row) => row.organization_id)))
  const [organizationNames, positions, details] = await Promise.all([
    mapInBatches(
      organizationIds,
      async (id) => {
        try {
          return (await getOrganization(id)).name
        } catch {
          return `#${id}`
        }
      },
      EXPORT_CONCURRENCY,
    ),
    listAllPositions().catch(() => []),
    mapInBatches(
      rows,
      async (row) => {
        try {
          return await getApprovalTemplateDetail(row.id, true)
        } catch {
          return null
        }
      },
      EXPORT_CONCURRENCY,
    ),
  ])

  const organizationNameById = new Map(
    organizationIds.map((id, index) => [id, organizationNames[index]]),
  )
  const positionNameByCode = new Map(positions.map((item) => [item.code, item.name]))

  // 指定审批人工号 → 姓名：批量查询（失败时姓名列回退「—」）
  const assigneeIds = details.flatMap((detail) =>
    (detail?.steps ?? [])
      .map((step) => step.assignee_value)
      .filter((value): value is number => value != null && value > 0),
  )
  const { names: assigneeNames } = await resolveUserNames(assigneeIds)

  /** 第一张表：指标本身字段 */
  const metricSheet: XlsxSheet = {
    name: t('approvalTemplate.exportSheetMetrics'),
    columns: [
      { header: t('approvalTemplate.colCode'), width: 18 },
      { header: t('approvalTemplate.colName'), width: 28 },
      { header: t('approvalTemplate.fieldOrganization'), width: 32 },
      { header: t('approvalTemplate.colBusinessType'), width: 14 },
      { header: t('approvalTemplate.colEnabled'), width: 10 },
      { header: t('approvalTemplate.fieldDescription'), width: 40 },
      { header: t('approvalTemplate.fieldCreatedAt'), width: 20 },
      { header: t('approvalTemplate.colUpdatedAt'), width: 20 },
    ],
    rows: rows.map((row) => [
      row.code,
      row.name,
      organizationNameById.get(row.organization_id) ?? `#${row.organization_id}`,
      getBusinessTypeLabel(row.business_type, t),
      row.enabled ? t('approvalTemplate.enabled_yes') : t('approvalTemplate.enabled_no'),
      row.description?.trim() || '—',
      formatDateTime(row.created_at, locale),
      formatDateTime(row.updated_at, locale),
    ]),
  }

  /** 第二张表：审批步骤（按指标逐条展开） */
  const stepRows: (string | number)[][] = []
  rows.forEach((row, index) => {
    const steps = [...(details[index]?.steps ?? [])].sort((a, b) => a.step_no - b.step_no)
    steps.forEach((step) => {
      stepRows.push([
        row.code,
        row.name,
        step.step_no,
        step.position ? positionNameByCode.get(step.position) ?? step.position : '—',
        step.assignee_value == null ? '—' : String(step.assignee_value),
        step.assignee_value == null
          ? '—'
          : assigneeNames.get(step.assignee_value) ?? '—',
        step.description?.trim() || '—',
      ])
    })
  })

  const stepSheet: XlsxSheet = {
    name: t('approvalTemplate.exportSheetSteps'),
    columns: [
      { header: t('approvalTemplate.colCode'), width: 18 },
      { header: t('approvalTemplate.colName'), width: 28 },
      { header: t('approvalTemplate.colStepNo'), width: 10 },
      { header: t('approvalTemplate.colStepPosition'), width: 20 },
      { header: t('approvalTemplate.colStepAssignee'), width: 20 },
      { header: t('approvalTemplate.colStepAssigneeName'), width: 16 },
      { header: t('approvalTemplate.colStepDescription'), width: 32 },
    ],
    rows: stepRows,
  }

  downloadXlsx(fileName, [metricSheet, stepSheet])
  return { metricCount: rows.length, stepCount: stepRows.length }
}
