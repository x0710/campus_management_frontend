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
  UpdateCredentialRequest,
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
 * 查询指定用户的账户认证信息（含用户名）。
 * GET /api/credentials/{uid}：本人或具备 credential.read 权限（并在数据范围内）时可查；走会话内缓存。
 * @param uid 目标用户 ID（必填，正整数）
 * @returns Promise<UserInfo> 含 uid/username/status/last_login_at（必返回）
 */
export function getCredential(uid: number): Promise<UserInfo> {
  return cachedGet<UserInfo>(`/credentials/${uid}`)
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

/**
 * 修改当前登录用户自己的密码（PATCH /api/credentials）。
 * 后端「修改自己」分支要求验证旧密码，故必须提供 oldPassword；旧密码错误返回 403。
 * @param uid 当前登录用户 ID（必填，取自 getCurrentUser().uid）
 * @param oldPassword 旧密码（必填，用于后端校验）
 * @param newPassword 新密码（必填）
 */
export async function changeMyPassword(
  uid: number,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const body: UpdateCredentialRequest = {
    uid,
    old_password: oldPassword,
    new_password: newPassword,
  }
  await http.patch('/credentials', body)
}
