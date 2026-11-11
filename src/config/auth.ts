/**
 * 登录页相关常量（代码要求 7：常量统一收敛到 config/）。
 */

/** 「记住用户名」在 localStorage 中的存储键 */
export const REMEMBERED_USERNAME_KEY = 'campus-remembered-user'

/** 学校 CAS 认证中心与认证成功后的后端回调地址。 */
export const CAS_SERVER_URL = 'https://authserver.jgsu.edu.cn/authserver'
/** 浏览器先进入前端页面，再由页面调用后端 /api/auth/cas/callback 验票。 */
export const CAS_CALLBACK_PATH = '/campus/api/auth/cas/callback'
export const CAS_SERVICE_URL = `https://partymc.jgsu.edu.cn${CAS_CALLBACK_PATH}`
export const CAS_LOGIN_URL = `${CAS_SERVER_URL}/login?service=${encodeURIComponent(CAS_SERVICE_URL)}`
