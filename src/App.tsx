/** 路由守卫：未登录时跳转登录页，并记录来源地址以便登录后回跳 */

import { Navigate, Route, Routes, useLocation, Outlet } from 'react-router'
import LoginPage from './pages/LoginPage'
import AnnouncementDetailPage from './pages/main/AnnouncementDetailPage'
import AnnouncementEditorPage from './pages/leader/AnnouncementEditorPage'
import MemberDetailPage from './pages/leader/MemberDetailPage'
import MainPage from './pages/main/MainPage'
import PortalModuleRoute from './pages/main/PortalModuleRoute'
import PortalWorkspace from './pages/main/PortalWorkspace'
import { useAuthStore } from './store/auth'


/** 路由守卫：未登录时跳转登录页，并记录来源地址以便登录后回跳 */
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
        <Route path="/home" element={<MainPage />} />

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
      </Route>

      {/* 重定向 */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
