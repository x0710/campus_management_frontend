/**
 * 登录成功后在本机暂存密码，供下次登录预填密码框，保留一天后自动失效。
 * 仅做有效期控制：密码以明文存放于 localStorage，公共设备上请勿使用；
 * 读取到过期数据时立即删除，避免继续预填。
 */
import { REMEMBERED_PASSWORD_KEY, REMEMBERED_PASSWORD_TTL_MS } from '../config/auth'

interface StoredPassword {
  password: string
  expiresAt: number
}

function isValid(value: unknown): value is StoredPassword {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<StoredPassword>
  return typeof data.password === 'string' && data.password !== '' &&
    typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt)
}

/** 登录成功后写入密码，有效期从本次登录起算一天。 */
export function saveRememberedPassword(password: string): void {
  if (!password) return
  try {
    const data: StoredPassword = {
      password,
      expiresAt: Date.now() + REMEMBERED_PASSWORD_TTL_MS,
    }
    localStorage.setItem(REMEMBERED_PASSWORD_KEY, JSON.stringify(data))
  } catch {
    // 浏览器禁止本地存储时忽略，下次需手动输入密码。
  }
}

/** 读取仍在有效期内的密码，过期或数据异常时清除并返回 null。 */
export function readRememberedPassword(): string | null {
  try {
    const raw = localStorage.getItem(REMEMBERED_PASSWORD_KEY)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!isValid(data) || data.expiresAt <= Date.now()) {
      localStorage.removeItem(REMEMBERED_PASSWORD_KEY)
      return null
    }
    return data.password
  } catch {
    try {
      localStorage.removeItem(REMEMBERED_PASSWORD_KEY)
    } catch {
      // 本地存储不可用时无需处理。
    }
    return null
  }
}

/** 密码失效（如登录被拒绝）时清除，避免继续预填错误密码。 */
export function clearRememberedPassword(): void {
  try {
    localStorage.removeItem(REMEMBERED_PASSWORD_KEY)
  } catch {
    // 本地存储不可用时无需处理。
  }
}
