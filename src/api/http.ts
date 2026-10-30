import axios from 'axios'
import { invalidate } from './cache'
import { useAuthStore } from '../store/auth'

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
  const token = useAuthStore.getState().token
  if (token) {
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
      error.config?.url !== '/login'
    ) {
      // 先清空接口会话缓存再清登录态，避免下一位登录用户读到上一位用户的数据（代码要求 17）
      invalidate()
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
