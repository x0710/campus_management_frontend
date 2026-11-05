/**
 * 表格分页文案工具：统一展示「共 N 条，共 M 页」（代码要求 12）。
 * 各列表页的 antd pagination.showTotal 统一调用本函数，避免逐页复制分页文案。
 */
import type { TranslateFn } from '../i18n'

/**
 * 生成分页总数文案。
 * @param t 翻译函数（必填，来自 useT()）
 * @param total 数据总条数（必填）
 * @param pageSize 每页条数（必填，<=0 时按 1 处理，避免除零）
 * @returns string 形如「共 128 条，共 2 页」
 */
export function formatPaginationTotal(
  t: TranslateFn,
  total: number,
  pageSize: number,
): string {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  return `${t('common.total')} ${total} ${t('common.items')}，${t('common.totalPages', {
    n: totalPages,
  })}`
}
