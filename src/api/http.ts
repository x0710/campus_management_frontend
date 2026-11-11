/** 全局 axios 实例与请求/响应拦截器（JWT 鉴权、401 处理、错误透传）。 */

import axios from 'axios'
import { publishCacheInvalidation } from './cacheInvalidation'
import { useAuthStore } from '../store/auth'
import { activeImportPreview } from '../store/importPreview'
import { useSettingsStore } from '../store/settings'

/**
 * 全局 axios 实例：
 * - baseURL 走相对路径 /api，开发环境由 Vite 代理转发到后端服务器（见 vite.config.ts）
 * - 请求拦截器自动附带 JWT（Bearer Token）
 * - 响应拦截器统一处理登录失效（401）：清除本地登录态，由 React Router 客户端跳转到登录页
 */
export const http = axios.create({
  baseURL: '/api',
  timeout: 15_000,
})

http.interceptors.request.use((config) => {
  const readOnlyPost = config.url === '/organizations/member-counts'
  const accountAction = config.url === '/login' || /^\/credentials\/\d+\/impersonate$/.test(config.url ?? '')
  if (activeImportPreview() && config.method !== 'get' && !readOnlyPost && !accountAction) {
    const reason = useSettingsStore.getState().locale === 'zh'
      ? '模拟导入为只读预览，请先退出模拟再修改真实数据。'
      : 'Import preview is read-only. Exit the preview before changing real data.'
    throw new axios.AxiosError(reason, 'ERR_PREVIEW_READ_ONLY', config, undefined, {
      config, status: 409, statusText: 'Preview is read-only', headers: {}, data: reason,
    })
  }
  const token = useAuthStore.getState().token
  if (token && config.url !== '/auth/cas/callback' && !config.headers.has('Authorization')) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.url !== '/login' &&
      error.config?.url !== '/auth/cas/callback' &&
      // 切换身份前的在途请求不能清除新会话。
      error.config?.headers?.Authorization === `Bearer ${useAuthStore.getState().token}`
    ) {
      // 先清空接口会话缓存再清登录态，避免下一位登录用户读到上一位用户的数据（代码要求 17）
      publishCacheInvalidation()
      useAuthStore.getState().clearAuth()
      /*
       * 这里不再使用 window.location.assign('/login') 强制整页跳转：
       * 生产环境前端由 Nginx 静态托管时，若未配置 history fallback，
       * 直接请求 /login 会被 Nginx 当作静态路径并返回 404。
       * clearAuth() 更新 token 后，RequireAuth 会立即通过 React Router
       * 在客户端跳转到 /login，不会产生新的页面请求。
       */
    }
    return Promise.reject(error)
  },
)
