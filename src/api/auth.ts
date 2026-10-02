/** 认证模块, 提供登录、注册与当前登录用户信息查询 API */
import { cachedGet } from './cache'
import { http } from './http'
import { queryUserRoles } from './rbac'
import type { UserRoleInfo } from './types/rbac'
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  UserInfo,
} from './types/auth'

/** 用户名密码登录，成功后返回 JWT 与用户信息（POST /api/login） */
export function login(data: LoginRequest) {
  return http.post<LoginResponse>('/login', data).then((res) => res.data)
}

/**
 * 自助注册账户（POST /api/auth/register）。
 * 邀请码由部署环境配置，不提供或无效时后端返回 403；用户名已存在返回 409。
 */
export function register(data: RegisterRequest) {
  return http
    .post<RegisterResponse>('/auth/register', data)
    .then((res) => res.data)
}

/** 拉取当前登录用户信息（会话内缓存一次） */
export function getCurrentUser() {
  return cachedGet<UserInfo>('/credentials/me')
}

/**
 * 获取当前登录用户的所有角色。
 * @param force 是否跳过已解析缓存强制刷新，默认 false
 * @returns 当前用户角色列表
 */
export async function getMyRoles(force?: boolean): Promise<UserRoleInfo[]> {
  const me = await getCurrentUser()
  const roles = await queryUserRoles([me.uid], force)
  return roles.filter((role) => role.uid === me.uid)
}
