import axios from 'axios'
import { useAuthStore } from '../store/auth'

/**
 * 全局 axios 实例：
 * - baseURL 走相对路径 /api，开发环境由 Vite 代理转发到 campus-server（默认 8000 端口）
 * - 请求拦截器自动附带 JWT（Bearer Token）
 * - 响应拦截器统一处理登录失效（401）：清除本地登录态并回到登录页
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
      useAuthStore.getState().clearAuth()
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)
