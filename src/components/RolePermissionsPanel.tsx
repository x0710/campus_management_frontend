/**
 * 角色权限分配子页面（非弹窗，可复用组件）：
 * 从角色列表进入后，以页面内的子页面展示「分配权限」与「配置数据范围」——
 * 勾选权限后，在同行选择该权限的数据范围，点保存一并提交。
 * - 打开时并行拉取全部权限、角色已分配权限、角色已有数据范围配置；
 * - 顶部搜索框：输入停止 RBAC_PERM_SEARCH_DEBOUNCE_MS 后对本地缓存的权限列表做
 *   编码/名称的模糊匹配（子序列也算命中，如 `coll` → `college.read`），不额外发请求；
 * - 数据范围按完整权限码独立配置，未配置时显示历史资源默认值。
 * - 保存：先 PUT permissions 覆盖权限，再 PUT data-scopes 覆盖数据范围
 *   （保留未编辑的全部配置），成功后回调 onSaved（代码要求 13）。
 */
import {
  ArrowLeftOutlined,
  DownOutlined,
  SearchOutlined,
  UpOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Input,
  Select,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import {
  assignRoleDataScopes,
  assignRolePermissions,
  getRoleDataScopes,
  getRolePermissions,
  queryPermissions,
} from '../api/rbac'
import { extractErrorReason } from '../api/common'
import type {
  DataScope,
  Permission as PermInfo,
  RoleInfo,
} from '../api/types/rbac'
import { useErrorFeedback } from '../composables/useErrorFeedback'
import {
  DATA_SCOPE_OPTIONS,
  RBAC_DATA_SCOPE_VALUE_MAX_LENGTH,
  RBAC_PERMISSION_PAGE_SIZE,
  RBAC_PERM_SEARCH_DEBOUNCE_MS,
} from '../config/rbac'
import { useT } from '../i18n'
import { formatPaginationTotal } from '../utils/pagination'
import ErrorState from './ErrorState'

import { parseRoleDataScopes, serializeRoleDataScopes, type ScopeConfig } from '../utils/roleDataScopes'

interface RolePermissionsPanelProps {
  /** 目标角色（必填；返回列表后再次进入会重新挂载，内部状态自然重置） */
  role: RoleInfo
  /** 点击「返回角色列表」或「取消」时触发（必填） */
  onCancel: () => void
  /** 保存成功后触发，用于刷新列表（必填） */
  onSaved: () => void
}

/**
 * 取历史资源默认值的键；仅用于兼容旧配置，新编辑使用完整权限码。
 * @param code 权限编码（必填，如 college.read）
 * @returns 资源标识（无分隔符时返回原编码）
 */
function permissionResource(code: string): string {
  const index = code.indexOf('.')
  return index > 0 ? code.slice(0, index) : code
}

/**
 * 权限模糊匹配：不区分大小写。
 * 命中条件为「包含关键词」或「关键词是文本的子序列」，便于只记得首字母时也能搜到（coll → college.read）。
 * @param text 待匹配文本（权限编码或名称）
 * @param keyword 已转为小写的搜索关键词
 * @returns 是否命中
 */
function fuzzyMatch(text: string, keyword: string): boolean {
  if (!keyword) return true
  const lower = text.toLowerCase()
  if (lower.includes(keyword)) return true
  let cursor = 0
  for (const char of lower) {
    if (char === keyword[cursor]) cursor += 1
    if (cursor === keyword.length) return true
  }
  return false
}

/**
 * 把「资源 → 数据范围」配置序列化成可比较的签名，用于判断是否存在未保存修改。
 * @param map 当前数据范围映射
 * @param resources 参与比较的资源列表（已排序）
 * @returns 字符串签名
 */
function scopeSignature(map: Record<string, ScopeConfig>, resources: string[]): string {
  return resources
    .map((resource) => {
      const config = map[resource]
      return `${resource}=${config?.scope ?? ''}:${config?.scopeValue.trim() ?? ''}`
    })
    .join('|')
}

/** RolePermissionsPanel 组件。
 * @param { role, onCancel, onSaved, } 类型：RolePermissionsPanelProps；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function RolePermissionsPanel({
  role,
  onCancel,
  onSaved,
}: RolePermissionsPanelProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()

  /** 全部权限（跨页聚合，保证模糊搜索覆盖完整权限集合） */
  const [perms, setPerms] = useState<PermInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /** 已勾选的权限 ID */
  const [selected, setSelected] = useState<number[]>([])
  const [initialSelected, setInitialSelected] = useState<number[]>([])
  /** 资源 → 数据范围配置 */
  const [scopeMap, setScopeMap] = useState<Record<string, ScopeConfig>>({})
  const [initialScopeMap, setInitialScopeMap] = useState<Record<string, ScopeConfig>>({})

  /** 搜索框即时输入值与防抖后的关键词 */
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')

  /** 权限表格当前页码（代码要求 12：支持分页并展示总页数） */
  const [permPage, setPermPage] = useState(1)

  /** 「已分配权限」区域是否收起（默认展开，收起后仅保留标题与数量） */
  const [assignedCollapsed, setAssignedCollapsed] = useState(false)

  // 进入子页面时并行拉取全部权限、角色已分配权限、角色已有数据范围
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [firstPage, currentPerms, currentScopes] = await Promise.all([
          queryPermissions({ page: 1, page_size: RBAC_PERMISSION_PAGE_SIZE }),
          getRolePermissions(role.id),
          getRoleDataScopes(role.id),
        ])
        let all = firstPage.data
        // 权限总数超过单页上限时继续拉取，避免搜索漏掉后面的权限
        const pages = Math.ceil(firstPage.total / RBAC_PERMISSION_PAGE_SIZE)
        for (let page = 2; page <= pages; page += 1) {
          const next = await queryPermissions({
            page,
            page_size: RBAC_PERMISSION_PAGE_SIZE,
          })
          all = all.concat(next.data)
        }
        if (cancelled) return
        setPerms(all)

        const ids = currentPerms.map((item) => item.id)
        setSelected(ids)
        setInitialSelected(ids)

        const map = parseRoleDataScopes(currentScopes)
        setScopeMap(map)
        setInitialScopeMap(map)
      } catch (err) {
        if (!cancelled) setLoadError(extractErrorReason(err, t))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [role.id, t])

  // 输入停顿后再生效关键词：避免每敲一个字符就重算整张表
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(searchInput.trim().toLowerCase())
      setPermPage(1)
    }, RBAC_PERM_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  /** 搜索后的权限列表（编码或名称模糊命中） */
  const visiblePerms = useMemo(
    () =>
      keyword
        ? perms.filter(
            (item) =>
              fuzzyMatch(item.code, keyword) || fuzzyMatch(item.name, keyword),
          )
        : perms,
    [perms, keyword],
  )

  // PUT 是完整替换：比较并保留所有配置，包括历史默认值和暂未授权的权限配置。
  const scopeKeys = useMemo(
    () => [...new Set([...Object.keys(scopeMap), ...Object.keys(initialScopeMap)])].sort(),
    [scopeMap, initialScopeMap],
  )

  /** 是否存在未保存修改（权限集合或任意数据范围发生变化） */
  const dirty = useMemo(() => {
    if (selected.length !== initialSelected.length) return true
    const initial = new Set(initialSelected)
    if (!selected.every((id) => initial.has(id))) return true
    return (
      scopeSignature(scopeMap, scopeKeys) !==
      scopeSignature(initialScopeMap, scopeKeys)
    )
  }, [selected, initialSelected, scopeMap, initialScopeMap, scopeKeys])

  /** 已勾选的权限明细（不受搜索过滤影响，用于顶部「已分配」展示） */
  const selectedPerms = useMemo(
    () => perms.filter((item) => selectedSet.has(item.id)),
    [perms, selectedSet],
  )

  /** 取消勾选某个权限（顶部已分配标签的关闭按钮） */
  const unselectPerm = (id: number) => {
    setSelected((prev) => prev.filter((item) => item !== id))
  }

  /** 写入/清空单项权限的精确范围（null 表示恢复默认值） */
  const updateScope = (resource: string, next: ScopeConfig | null) => {
    setScopeMap((prev) => {
      const copy = { ...prev }
      if (next === null) delete copy[resource]
      else copy[resource] = next
      return copy
    })
  }

  /** 数据范围下拉选项（label 为文案，desc 为悬停提示，代码要求 10） */
  const scopeOptions = DATA_SCOPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    desc: t(option.descKey),
  }))

  /** 保存：校验自定义范围后，先覆盖权限、再覆盖数据范围 */
  const submit = async () => {
    for (const resource of Object.keys(scopeMap)) {
      const config = scopeMap[resource]
      if (config?.scope === 'custom' && !config.scopeValue.trim()) {
        message.error(t('adminRoles.dsCustomRequired'))
        return
      }
    }
    setSaving(true)
    try {
      const scopes = serializeRoleDataScopes(scopeMap)
      await assignRolePermissions(role.id, selected)
      await assignRoleDataScopes(role.id, scopes)
      message.success(t('adminRoles.assignSuccess'))
      onSaved()
      onCancel()
    } catch (err) {
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<PermInfo> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: t('adminRoles.fieldCode'),
      dataIndex: 'code',
      key: 'code',
      width: 190,
      render: (value: string) => <span className="rbac-perm-code">{value}</span>,
    },
    { title: t('adminRoles.fieldName'), dataIndex: 'name', key: 'name', width: 150 },
    {
      title: t('adminRoles.fieldDesc'),
      dataIndex: 'description',
      key: 'description',
      render: (value: string) => value || t('common.unknown'),
    },
    {
      title: t('adminRoles.dsScope'),
      key: 'scope',
      width: 260,
      render: (_, record) => {
        const resource = record.code
        const explicit = scopeMap[resource]
        const inherited = scopeMap[permissionResource(record.code)]
        const config = explicit ?? inherited
        // 接口不接受通配符配置键；通配权限仍可勾选授权。
        const wildcard = resource.includes('*')
        const disabled = !selectedSet.has(record.id) || wildcard
        return (
          <div className="rbac-scope-cell">
            <Tooltip title={wildcard ? t('adminRoles.dsWildcard') : `${t('adminRoles.fieldCode')}: ${resource}`}>
              <Select<DataScope>
                allowClear
                value={explicit?.scope}
                disabled={disabled}
                placeholder={wildcard
                  ? t('adminRoles.dsWildcard')
                  : t('adminRoles.dsInherited', {
                      scope: scopeOptions.find((option) => option.value === (inherited?.scope ?? 'self_only'))?.label ?? '',
                    })}
                style={{ width: '100%' }}
                options={scopeOptions}
                onChange={(value) =>
                  updateScope(
                    resource,
                    value === undefined
                      ? null
                      : {
                          scope: value,
                          // 非 custom 时清空组织 ID，避免提交无效值
                          scopeValue:
                            value === 'custom' ? (config?.scopeValue ?? '') : '',
                        },
                  )
                }
                optionRender={(option) => (
                  <Tooltip title={option.data.desc} placement="right">
                    <span>{option.label}</span>
                  </Tooltip>
                )}
              />
            </Tooltip>
            {!wildcard && config?.scope === 'custom' && (
              <Input
                value={config.scopeValue}
                disabled={disabled}
                className="rbac-scope-value"
                maxLength={RBAC_DATA_SCOPE_VALUE_MAX_LENGTH}
                placeholder={t('adminRoles.dsScopeValuePlaceholder')}
                onChange={(event) =>
                  updateScope(resource, {
                    scope: 'custom',
                    scopeValue: event.target.value,
                  })
                }
              />
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="data-page-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">
            {`${t('adminRoles.assignPermsTitle')}：${role.name}（${role.code}）`}
          </h3>
          <Button icon={<ArrowLeftOutlined />} onClick={onCancel}>
            {t('adminRoles.backToRoles')}
          </Button>
        </header>
        {/* 卡片体固定：搜索与底部保存按钮不动，仅权限表格区域滚动（代码要求 23） */}
        <div className="panel-card-body data-page-body">
          {loadError ? (
            <ErrorState message={loadError} />
          ) : (
            <>
              <div className="approval-toolbar" style={{ marginBottom: 12 }}>
                <Input
                  allowClear
                  className="admin-search"
                  prefix={<SearchOutlined />}
                  value={searchInput}
                  placeholder={t('adminRoles.permSearchInAssign')}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <span className="rbac-search-count">
                  {t('common.total')} {visiblePerms.length} {t('common.items')}
                </span>
              </div>
              {/* 已分配权限常驻展示：搜索过滤只影响下方列表，不会让已分配的权限「消失」 */}
              {selectedPerms.length > 0 && (
                <div
                  className={`rbac-assigned${assignedCollapsed ? ' is-collapsed' : ''}`}
                >
                  <div className="rbac-assigned-head">
                    <span className="rbac-assigned-label">
                      {t('adminRoles.assignedPerms', { n: selectedPerms.length })}
                    </span>
                    <Button
                      type="link"
                      size="small"
                      className="rbac-assigned-toggle"
                      icon={assignedCollapsed ? <DownOutlined /> : <UpOutlined />}
                      onClick={() => setAssignedCollapsed((prev) => !prev)}
                    >
                      {t(
                        assignedCollapsed
                          ? 'adminRoles.expandAssigned'
                          : 'adminRoles.collapseAssigned',
                      )}
                    </Button>
                  </div>
                  {!assignedCollapsed && (
                    <div className="rbac-assigned-tags">
                      {selectedPerms.map((item) => (
                        <Tag
                          key={item.id}
                          color="geekblue"
                          closable
                          onClose={() => unselectPerm(item.id)}
                        >
                          {item.code}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="data-scroll">
                <Table<PermInfo>
                  rowKey="id"
                  size="small"
                  loading={loading}
                  columns={columns}
                  dataSource={visiblePerms}
                  locale={{ emptyText: t('common.noData') }}
                  pagination={{
                    current: permPage,
                    pageSize: RBAC_PERMISSION_PAGE_SIZE,
                    total: visiblePerms.length,
                    showSizeChanger: false,
                    showQuickJumper: true,
                    showTotal: (n: number) =>
                      formatPaginationTotal(t, n, RBAC_PERMISSION_PAGE_SIZE),
                    onChange: (p: number) => setPermPage(p),
                  }}
                  rowSelection={{
                    selectedRowKeys: selected,
                    // 搜索过滤会改变 dataSource，开启后已选但被过滤掉的行不会被 antd 丢弃，
                    // 否则覆盖式保存会把它们当作「已取消」而从角色上移除（数据丢失）
                    preserveSelectedRowKeys: true,
                    onChange: (keys) => setSelected(keys.map(Number)),
                  }}
                />
              </div>

              {/* 子页面底部操作区：取消返回列表，保存提交权限与数据范围 */}
              <div className="approval-toolbar" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
                <Button onClick={onCancel}>{t('approval.cancel')}</Button>
                <Button
                  type="primary"
                  loading={saving}
                  disabled={loading || loadError !== null || !dirty}
                  onClick={() => void submit()}
                >
                  {t('adminRoles.save')}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
