/** 认证模块, 提供登录、注册与当前登录用户信息查询 API */
import { cachedGet } from './cache'
import { http } from './http'
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