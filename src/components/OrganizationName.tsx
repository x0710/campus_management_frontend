import { useEffect, useState } from 'react'
import { Popover, Spin, Tree } from 'antd'
import { getOrganization, getOrganizationTree } from '../api/organizations'
import type { OrganizationTreeNode } from '../api/types/organizations'
import { extractErrorReason } from '../api/common'
import { useT } from '../i18n'
import { useParams } from 'react-router'

/** 悬浮时挂载，组织链路按接口返回的根 → 当前组织顺序展示。 */
function OrganizationTreePreview({ id, showCode }: { id: number; showCode: boolean }) {
  const t = useT()
  const [chain, setChain] = useState<OrganizationTreeNode[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getOrganizationTree(id)
      .then((value) => { if (!cancelled) setChain(value) })
      .catch((err) => { if (!cancelled) setError(extractErrorReason(err, t)) })
    return () => { cancelled = true }
  }, [id, t])

  if (error) return <span role="alert">{error}</span>
  if (!chain) return <Spin size="small" />
  if (!chain.length) return <span>{t('common.noData')}</span>

  type Node = { key: number; title: string; children?: Node[] }
  const tree = chain.reduceRight<Node[]>((children, node) => [{
    key: node.id,
    title: showCode ? `${node.name}（${node.code}）` : `${node.name} (${node.id})`,
    ...(children.length ? { children } : {}),
  }], [])

  return <Tree treeData={tree} defaultExpandAll selectable={false} showLine />
}

/** 按 ID 显示组织名称；showTree 开启后悬浮查看组织链路。 */
export default function OrganizationName({ id, showTree = false, showCode, fallbackName, code }: {
  id: number
  showTree?: boolean
  showCode?: boolean
  fallbackName?: string
  code?: string
}) {
  const { portalKey } = useParams<{ portalKey: string }>()
  const withCode = showCode ?? (portalKey === 'admin')

  const [organization, setOrganization] = useState<{ id: number; name: string; code: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (fallbackName && (!withCode || code !== undefined)) return
    getOrganization(id)
      .then((value) => {
        if (!cancelled) setOrganization(value)
      })
      .catch(() => {
        // 无权限或组织已删除时保留 ID，避免显示错误的组织归属。
        if (!cancelled) setOrganization(null)
      })
    return () => { cancelled = true }
  }, [id, fallbackName, withCode, code])

  const resolved = organization?.id === id ? organization : null
  const label = resolved?.name || fallbackName || `#${id}`
  const organizationCode = code ?? resolved?.code
  const name = withCode && organizationCode ? `${label}（${organizationCode}）` : label
  if (!showTree) return <>{name}</>

  return (
    <Popover
      trigger="hover"
      destroyOnHidden
      content={(
        <div style={{ maxWidth: 480, maxHeight: 360, overflow: 'auto' }} onDoubleClick={(event) => event.stopPropagation()}>
          <OrganizationTreePreview key={id} id={id} showCode={withCode} />
        </div>
      )}
    >
      <span style={{ cursor: 'help', borderBottom: '1px dotted currentColor' }}>{name}</span>
    </Popover>
  )
}
