/**
 * 门户布局（界面壳）：作为各工作端（学生/老师/领导/管理员）的持久框架页。
 * 顶栏（PortalHeader）+ 左侧菜单（Layout.Sider，可收起）+ 内容区（Outlet），
 * 在该门户内进行任何子路由跳转（切换模块、进入公告详情等）时，顶栏与侧栏保持不变，
 * 仅内容区会随路由变化而更新，与上方顶栏的「界面壳」行为保持一致。
 * 不同门户（student/teacher/leader/admin）渲染各自模块菜单。
 *
 * 选中态由当前 URL 推导：
 *   - /portal/:portalKey/:moduleKey        -> 高亮 moduleKey
 *   - /portal/:portalKey/announcements/:id -> 高亮 ?from=<moduleKey>（来源模块）
 * 这样从公告列表点击进入详情时，左侧仍能高亮原模块入口。
 *
 * 侧栏收起状态持久化到 settings store（localStorage），跨门户与刷新保持。
 */
import {
  ArrowLeftOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, Tag, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { useEffect, useMemo } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import PortalHeader from '../../components/PortalHeader'
import { getPortal, type PortalModule } from '../../config/portals'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'

export default function PortalWorkspace() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { portalKey } = useParams<{ portalKey: string }>()
  const portal = getPortal(portalKey)

  // 侧栏收起状态：持久化到 settings store（localStorage）
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)

  const readyModules = useMemo(
    () => (portal ? portal.modules.filter((m) => m.status === 'ready') : []),
    [portal],
  )
  const previewModules = useMemo(
    () => (portal ? portal.modules.filter((m) => m.status === 'preview') : []),
    [portal],
  )
  const pendingModules = useMemo(
    () => (portal ? portal.modules.filter((m) => m.status === 'pending-api') : []),
    [portal],
  )
  const plannedModules = useMemo(
    () => (portal ? portal.modules.filter((m) => m.status === 'planned') : []),
    [portal],
  )

  // 从当前 URL 推导被高亮的模块 key：
  //   /portal/student/student_m4            -> "student_m4"
  //   /portal/student/announcements/123?from=student_m4 -> "student_m4"
  //   /portal/student/                      -> 无高亮（index 子路由会自行跳转到首个已开通模块）
  const selectedKey = useMemo(() => {
    if (!portal) return undefined
    const segments = location.pathname.split('/').filter(Boolean)
    if (segments.length < 3 || segments[0] !== 'portal' || segments[1] !== portal.key) {
      return undefined
    }
    const third = segments[2]
    // 详情类子路由（公告详情/编辑、成员详情）不在模块列表中，
    // 通过 ?from=<moduleKey> 让侧栏仍高亮来源模块
    if (third === 'announcements' || third === 'organization-members') {
      const from = new URLSearchParams(location.search).get('from')
      if (from && [...readyModules, ...previewModules].some((m) => m.key === from)) return from
      return undefined
    }
    return [...readyModules, ...previewModules].some((m) => m.key === third) ? third : undefined
  }, [portal, location.pathname, location.search, readyModules, previewModules])

  // 仅当 portal 不存在时回首页；模块路由跳转交给子路由处理，避免与子路由抢跳转
  useEffect(() => {
    if (!portal) {
      navigate('/home', { replace: true })
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

  if (!portal) {
    return <Navigate to="/home" replace />
  }

  const name = t(`portal.${portal.key}_name`)

  return (
    <div className="workspace-page">
      <PortalHeader
        left={
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            className="workspace-back"
            onClick={() => navigate('/home')}
          >
            {t('portal.back')}
          </Button>
        }
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
              navigate(`/portal/${portal.key}/${key}`)
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}
