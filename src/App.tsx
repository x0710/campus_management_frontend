/** 
 * 应用路由定义与路由守卫。
 * /login 为公开登录页；其余路由统一经过 RequireAuth 守卫。
 * / 是登录后的角色解析页，会根据当前用户角色跳转到对应门户；
 * /portal/:portalKey 是各门户的工作台（顶栏 + 侧栏 + 内容区）。
 */

import { Navigate, Route, Routes, useLocation, Outlet } from 'react-router'
import LoginPage from './pages/LoginPage'
import AnnouncementDetailPage from './pages/main/AnnouncementDetailPage'
import AnnouncementEditorPage from './pages/leader/AnnouncementEditorPage'
import MemberDetailPage from './pages/leader/MemberDetailPage'
import PortalModuleRoute from './pages/main/PortalModuleRoute'
import PortalRedirect from './pages/main/PortalRedirect'
import PortalWorkspace from './pages/main/PortalWorkspace'
import { useAuthStore } from './store/auth'


/**
 * 路由守卫组件。
 * 无入参；未登录时返回跳转 /login 的 Navigate 元素，
 * 已登录时渲染子路由出口 Outlet。
 */
function RequireAuth() {
  const token = useAuthStore((s) => s.token)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* 受保护路由：统一由 RequireAuth 守卫 */}
      <Route element={<RequireAuth />}>
        {/* 登录后默认入口：根据角色跳转对应门户 */}
        <Route path="/" element={<PortalRedirect />} />

        {/* 兼容旧地址 /home，直接回到角色解析页，不再显示门户选择页 */}
        <Route path="/home" element={<Navigate to = "/" replace />} />

        {/*
          工作端布局：以 PortalWorkspace 作为「界面壳」（顶栏 + 侧栏 + 内容区），
          其下子路由共享同一侧栏菜单——切换模块或进入公告详情时侧栏不变，
          仅内容区替换。不同 portalKey 渲染对应门户的菜单。
        */}
        <Route path="/portal/:portalKey" element={<PortalWorkspace />}>
          {/* 进入 /portal/:portalKey（无 moduleKey）：由 PortalModuleRoute 跳转到首个已开通模块 */}
          <Route index element={<PortalModuleRoute />} />
          {/* /portal/:portalKey/:moduleKey：渲染具体模块视图 */}
          <Route path=":moduleKey" element={<PortalModuleRoute />} />
          {/* 公告新建（必须先于 :id 声明，避免 /announcements/new 被当作 id="new" 匹配） */}
          <Route path="announcements/new" element={<AnnouncementEditorPage />} />
          {/* 公告编辑：带 id，走 GET/PATCH /api/announcements/{id} */}
          <Route path="announcements/:id/edit" element={<AnnouncementEditorPage />} />
          {/* /portal/:portalKey/announcements/:id：公告详情，沿用同一界面壳与侧栏 */}
          <Route path="announcements/:id" element={<AnnouncementDetailPage />} />
          {/* 领导端成员详情：从组织概览点击成员进入，沿用同一界面壳与侧栏 */}
          <Route path="organization-members/:uid" element={<MemberDetailPage />} />
        </Route>

      {/* 未匹配的已登录地址统一回到角色解析页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
