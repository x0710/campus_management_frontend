import { getPortalPath, CAMPUS_PATH } from '../../config/routes'
import { usePortalParams } from '../../hooks/usePortalParams'
/**
 * 门户布局（界面壳）：作为各工作端（学生/老师/领导/管理员）的持久框架页。
 * 顶栏（PortalHeader）+ 左侧菜单（Layout.Sider，可收起）+ 内容区（Outlet），
 * 在该门户内进行任何子路由跳转（切换模块、进入公告详情等）时，顶栏与侧栏保持不变，
 * 仅内容区会随路由变化而更新，与上方顶栏的「界面壳」行为保持一致。
 * 不同门户（student/teacher/leader/admin）渲染各自模块菜单。
 *
 * 选中态由当前 URL 推导：
 *   - <门户路径>/:moduleKey        -> 高亮 moduleKey
 *   - <门户路径>/announcements/:id -> 高亮 ?from=<moduleKey>（来源模块）
 * 这样从公告列表双击进入详情时，左侧仍能高亮原模块入口。
 *
 * 侧栏收起状态持久化到 settings store（localStorage），跨门户与刷新保持。
 */
import {
  DoubleLeftOutlined,
  DoubleRightOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, Tag, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { Suspense, useEffect, useMemo } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import PortalHeader from '../../components/PortalHeader'
import PageLoading from '../../components/PageLoading'
import ImportPreviewBanner from '../../components/ImportPreviewBanner'
import { useImportPreview } from '../../store/importPreview'
import { BULK_ADD_MEMBERS_ROUTE } from '../../config/bulkMembers'
import {
  DEFAULT_PORTAL_KEY,
  getPortal,
  isPortalDisabled,
  type PortalModule,
} from '../../config/portals'
import { usePortalAccess } from '../../hooks/usePortalAccess'
import { PartyTerminologyContext, useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'

/** PortalWorkspace 组件。
 * @returns 类型：Element
 */
export default function PortalWorkspace() {
  const { portalKey } = usePortalParams<{ portalKey: string }>()
  const partyPortal = ['party', 'branch', 'academy', 'school'].includes(portalKey ?? '')
  return (
    <PartyTerminologyContext value={partyPortal}>
      <PortalWorkspaceContent />
    </PartyTerminologyContext>
  )
}

function PortalWorkspaceContent() {
  const previewRevision = useImportPreview((state) => state.revision)
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { portalKey } = usePortalParams<{ portalKey: string }>()
  const portal = getPortal(portalKey)
  // 角色访问校验：普通用户只能进入角色授权范围内的门户（超管除外）
  const portalAccess = usePortalAccess(portal?.key)

  // 侧栏收起状态：持久化到 settings store（localStorage）
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)

  // 侧栏只展示未隐藏的模块；hiddenFromMenu 的模块（如党员端「我的」）仍可通过路由访问
  const readyModules = useMemo(
    () => (portal ? portal.modules.filter((m) => m.status === 'ready' && !m.hiddenFromMenu) : []),
    [portal],
  )
  const previewModules = useMemo(
    () =>
      portal ? portal.modules.filter((m) => m.status === 'preview' && !m.hiddenFromMenu) : [],
    [portal],
  )
  const pendingModules = useMemo(
    () =>
      portal
        ? portal.modules.filter((m) => m.status === 'pending-api' && !m.hiddenFromMenu)
        : [],
    [portal],
  )
  const plannedModules = useMemo(
    () =>
      portal ? portal.modules.filter((m) => m.status === 'planned' && !m.hiddenFromMenu) : [],
    [portal],
  )

  // 从当前 URL 推导被高亮的模块 key：
  //   /campus/student/student_m4            -> "student_m4"
  //   /campus/student/announcements/123?from=student_m4 -> "student_m4"
  //   /campus/student/                      -> 无高亮（index 子路由会自行跳转到首个已开通模块）
  const selectedKey = useMemo(() => {
    if (!portal) return undefined
    const base = getPortalPath(portal.key)
    const child = location.pathname.slice(base.length).split('/').filter(Boolean)[0]
    // 详情类子路由（公告详情/编辑、成员详情、党建加分审批详情、成绩申报详情、审批指标详情）
    // 不在模块列表中，通过 ?from=<moduleKey> 让侧栏仍高亮来源模块
    if (
      child === 'announcements' ||
      child === 'organization-members' ||
      child === 'party-score-approvals' ||
      child === 'party-scores' ||
      child === 'approval-templates' ||
      child === BULK_ADD_MEMBERS_ROUTE
    ) {
      const from = new URLSearchParams(location.search).get('from')
      if (from && [...readyModules, ...previewModules].some((m) => m.key === from)) return from
      return undefined
    }
    return [...readyModules, ...previewModules].some((m) => m.key === child) ? child : undefined
  }, [portal, location.pathname, location.search, readyModules, previewModules])

  // 仅当 portal 不存在时回首页；模块路由跳转交给子路由处理，避免与子路由抢跳转
  useEffect(() => {
    if (!portal) {
      navigate(CAMPUS_PATH, { replace: true })
    }
  }, [portal, navigate])

  const menuItems = useMemo<MenuProps['items']>(() => {
    /** 锁定项（pending-api / planned）：保留模块图标，依赖 antd disabled 样式 + 标签指示状态 */
    const lockedItem = (m: PortalModule) => ({
      key: m.key,
      icon: m.icon,
      disabled: true,
      label: (
        <span className="workspace-menu-label">
          {t(`portal.${m.key}`)}
          {m.status === 'pending-api' && (
            <Tag color="orange" variant="filled" className="workspace-menu-tag">
              {t('portal.tagApiPending')}
            </Tag>
          )}
        </span>
      ),
    })

    /** 预览项（preview）：可点击，带「预览」标签，页面内为模拟数据 */
    const previewItem = (m: PortalModule) => ({
      key: m.key,
      icon: m.icon,
      label: (
        <span className="workspace-menu-label">
          {t(`portal.${m.key}`)}
          <Tag color="blue" variant="filled" className="workspace-menu-tag">
            {t('portal.tagPreview')}
          </Tag>
        </span>
      ),
    })

    const groups: NonNullable<MenuProps['items']> = []
    if (readyModules.length > 0) {
      groups.push({
        key: 'group-ready',
        type: 'group',
        label: t('portal.groupReady'),
        children: readyModules.map((m) => ({
          key: m.key,
          icon: m.icon,
          label: t(`portal.${m.key}`),
        })),
      })
    }
    if (previewModules.length > 0) {
      groups.push({
        key: 'group-preview',
        type: 'group',
        label: t('portal.groupPreview'),
        children: previewModules.map(previewItem),
      })
    }
    if (pendingModules.length > 0) {
      groups.push({
        key: 'group-api-pending',
        type: 'group',
        label: t('portal.groupApiPending'),
        children: pendingModules.map(lockedItem),
      })
    }
    if (plannedModules.length > 0) {
      groups.push({
        key: 'group-planned',
        type: 'group',
        label: t('portal.groupPlanned'),
        children: plannedModules.map(lockedItem),
      })
    }
    return groups
  }, [readyModules, previewModules, pendingModules, plannedModules, t])

  // 门户 key 非法或该门户已停用（学生端 / 教师端 / 领导端）时回到默认门户：
  // 直接输入 <门户路径>/... 也无法进入，代码保留但不再工作
  if (!portal || isPortalDisabled(portal.key)) {
    return <Navigate to={CAMPUS_PATH} replace />
  }

  // 角色权限校验：角色仍在加载时先展示加载态，未授权门户重定向到默认门户，
  // 避免普通用户手动输入 /campus/admin/... 直接渲染管理端页面
  if (portalAccess === null) {
    return <PageLoading />
  }
  if (!portalAccess) {
    return <Navigate to={getPortalPath(DEFAULT_PORTAL_KEY)} replace />
  }

  const name = t(`portal.${portal.key}_name`)

  return (
    <div className="workspace-page">
      <PortalHeader
      />

      <div className="workspace-body">
        <Layout.Sider
          className="workspace-sider"
          width={224}
          collapsedWidth={64}
          collapsible
          collapsed={sidebarCollapsed}
          onCollapse={setSidebarCollapsed}
          theme="light"
          trigger={null}
        >
          <div className="workspace-sider-title" style={{ color: portal.accent }}>
            <span className="workspace-sider-icon" style={{ background: portal.gradient }}>
              {portal.icon}
            </span>
            {!sidebarCollapsed && (
              <span className="workspace-sider-name">{name}</span>
            )}
          </div>
          <Menu
            mode="inline"
            items={menuItems}
            className="workspace-menu"
            inlineCollapsed={sidebarCollapsed}
            selectedKeys={selectedKey ? [selectedKey] : []}
            onClick={({ key }: { key: string }) =>
              navigate(`${getPortalPath(portal.key)}/${key}`)
            }
          />
          {/* 收起/展开按钮：自定义置于侧栏底部，悬停显示提示 */}
          <div className="workspace-sider-footer">
            <Tooltip title={sidebarCollapsed ? t('portal.expand') : t('portal.collapse')}>
              <Button
                type="text"
                className="workspace-sider-toggle"
                icon={sidebarCollapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              />
            </Tooltip>
          </div>
        </Layout.Sider>

        <main className="workspace-content">
          <ImportPreviewBanner />
          <Suspense key={previewRevision} fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
