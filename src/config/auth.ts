import { resolveApiUrl } from './api'
import { appPath } from './appBase'

/**
 * 登录页相关常量（代码要求 7：常量统一收敛到 config/）。
 */

/** 「记住用户名」在 localStorage 中的存储键 */
export const REMEMBERED_USERNAME_KEY = 'campus-remembered-user'

/** 「记住密码」在 localStorage 中的存储键 */
export const REMEMBERED_PASSWORD_KEY = 'campus-remembered-password'

/** 密码在本机保留的时长：一天后自动失效并从本地清除。 */
export const REMEMBERED_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000

/** 前端公开回调页，须由 Nginx 返回 index.html，与后端验票接口分开。 */
export const CAS_CALLBACK_PATH = appPath('auth/cas/callback')
/** 先由后端创建 state 和流程 Cookie，再重定向至学校认证中心。 */
export const CAS_LOGIN_URL = resolveApiUrl('/auth/cas/login')
