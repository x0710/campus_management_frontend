/**
 * 对照表卡片（可复用组件，代码要求 1）。
 *
 * 用于「批量添加新成员」辅助页的编码对照表（组织 / 身份 / 系统角色）：
 * 表头左侧放「查看哪张表」的切换控件（可选）与标题，右侧放搜索框与刷新；
 * 表体独立滚动，底部分页（每页最多 100 行，代码要求 12）。
 *
 * 设计约定：
 * - 数据由调用方一次性拉取全量后传入（映射类数据量小），本组件只做前端筛选与分页，
 *   因此切换搜索/翻页不产生后端请求（代码要求 5：数据已在 api 层做会话内缓存）。
 * - 搜索框仅在回车 / 点击搜索 / 清空时提交关键词，避免逐字符重渲染表格（代码要求 26）。
 * - 夜间模式通过 index.css 中的 .bulk-lookup-* 变量样式适配（代码要求 6）。
 */
import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Input, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState, type Key, type ReactNode } from 'react'
import { BULK_MAPPING_PAGE_SIZE } from '../config/bulkMembers'
import { useT } from '../i18n'
import { formatPaginationTotal } from '../utils/pagination'
import ErrorState from './ErrorState'

interface LookupTableCardProps<T extends object> {
  /** 表头左侧的切换控件（可选，如「组织 / 身份 / 系统角色」的分段选择器） */
  switcher?: ReactNode
  /** 卡片标题（可选；提供了 switcher 时通常省略，避免与切换项重复） */
  title?: string
  /** 标题右侧的说明提示（可选，已翻译文案；悬停展示，代码要求 10） */
  hint?: string
  /** 表头展示的总条数（可选，默认取 rows.length；切换表时可传入当前表条数） */
  count?: number
  /** 表格列定义（必填） */
  columns: ColumnsType<T>
  /** 全量数据（必填，可能为空数组） */
  rows: T[]
  /** 行 key 生成函数（必填） */
  rowKey: (row: T) => Key
  /** 是否加载中（可选，默认 false） */
  loading?: boolean
  /** 加载失败文案（可选；非空时用错误态替换表格，代码要求 9） */
  error?: string | null
  /** 搜索框占位文案（必填，已翻译文案） */
  searchPlaceholder: string
  /** 是否显示搜索框（可选，默认 true；样表说明这类没有筛选需求的表传 false） */
  searchable?: boolean
  /** 前端筛选函数（必填；(行数据, 已去空格的关键词) => 是否保留） */
  filter: (row: T, keyword: string) => boolean
  /** 空数据文案（可选，默认取 common.noData） */
  emptyText?: string
  /** 重试回调（可选；提供时错误态展示重试按钮） */
  onRetry?: () => void
  /** 表头右侧额外内容（可选，如刷新按钮） */
  extra?: ReactNode
  /** 表格上方的说明条（可选，如样表填写规则；随表体一起滚动） */
  banner?: ReactNode
  /** 透传类名（可选） */
  className?: string
}

/**
 * 对照表卡片：切换控件 / 标题 + 搜索 + 可滚动表格 + 分页。
 * @param props 见 LookupTableCardProps 说明
 * @returns 卡片元素
 */
export default function LookupTableCard<T extends object>({
  switcher,
  title,
  hint,
  count,
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  searchPlaceholder,
  searchable = true,
  filter,
  emptyText,
  onRetry,
  extra,
  banner,
  className,
}: LookupTableCardProps<T>) {
  const t = useT()
  const [keyword, setKeyword] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const term = keyword.trim()
    return term ? rows.filter((row) => filter(row, term)) : rows
  }, [rows, keyword, filter])

  // 筛选后行数变少时页码在渲染期收回到有效范围（不在 effect 中 setState，避免多一轮渲染）
  const maxPage = Math.max(1, Math.ceil(filtered.length / BULK_MAPPING_PAGE_SIZE))
  const safePage = Math.min(page, maxPage)

  /** 提交搜索关键词：空串表示清空筛选（代码要求 26：仅在提交时更新表格） */
  const commitSearch = (value: string) => {
    setKeyword(value.trim())
    setPage(1)
  }

  return (
    <section className={`panel-card bulk-lookup-card${className ? ` ${className}` : ''}`}>
      <header className="panel-card-header bulk-lookup-header">
        <div className="bulk-lookup-title">
          {switcher}
          {title && <h3 className="panel-card-title">{title}</h3>}
          {hint && (
            <Tooltip title={hint}>
              <InfoCircleOutlined className="bulk-lookup-hint" />
            </Tooltip>
          )}
          <Tag className="bulk-lookup-count" variant="filled">
            {t('bulkMembers.count', { n: count ?? rows.length })}
          </Tag>
        </div>
        <div className="bulk-lookup-actions">
          {searchable && (
            <Input.Search
              allowClear
              size="small"
              className="bulk-lookup-search"
              placeholder={searchPlaceholder}
              value={searchDraft}
              onChange={(e) => {
                setSearchDraft(e.target.value)
                // 清空按钮点击后立即恢复全量数据
                if (!e.target.value) commitSearch('')
              }}
              onSearch={commitSearch}
            />
          )}
          {extra}
        </div>
      </header>
      <div className="panel-card-body bulk-lookup-body">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : (
          <>
            {banner}
            <Table<T>
              size="small"
              className="bulk-lookup-table"
              columns={columns}
              dataSource={filtered}
              rowKey={rowKey}
              loading={loading}
              locale={{ emptyText: emptyText ?? t('common.noData') }}
              pagination={{
                current: safePage,
                pageSize: BULK_MAPPING_PAGE_SIZE,
                total: filtered.length,
                size: 'small',
                showSizeChanger: false,
                showQuickJumper: filtered.length > BULK_MAPPING_PAGE_SIZE,
                showTotal: (n: number) => formatPaginationTotal(t, n, BULK_MAPPING_PAGE_SIZE),
                onChange: (p: number) => setPage(p),
              }}
            />
          </>
        )}
      </div>
    </section>
  )
}

/**
 * 刷新按钮：统一图标与悬停提示。
 * @param props 类型：{ onRefresh: () => void; hint: string }；默认值：无；是否必填：必填
 * @returns 类型：Element（带 Tooltip 的按钮）
 */
export function LookupRefreshButton({
  onRefresh,
  hint,
}: {
  /** 刷新回调（必填） */
  onRefresh: () => void
  /** 悬停提示文案（必填，已翻译） */
  hint: string
}) {
  return (
    <Tooltip title={hint}>
      <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh} />
    </Tooltip>
  )
}
