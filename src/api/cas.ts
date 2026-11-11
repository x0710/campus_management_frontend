import { http } from './http'
import type { LoginResponse } from './types/auth'
import { readLoginResponse } from '../utils/loginSession'

export class InvalidCasCallbackError extends Error {
  constructor() { super('Invalid CAS callback parameters') }
}

/** 只合并在途请求；一次性票据和返回的 token 不进入会话接口缓存。 */
const pending = new Map<string, Promise<LoginResponse>>()

export function exchangeCasTicket(search: string): Promise<LoginResponse> {
  const query = new URLSearchParams(search)
  const ticket = query.get('ticket')
  const state = query.get('state')
  if (!ticket?.trim() || query.getAll('ticket').length !== 1 || query.getAll('state').length > 1 || state === '') {
    return Promise.reject(new InvalidCasCallbackError())
  }
  const params = state === null ? { ticket } : { ticket, state }
  const key = JSON.stringify(params)
  const previous = pending.get(key)
  if (previous) return previous
  const request = http.get<unknown>('/auth/cas/callback', { params })
    .then((response) => readLoginResponse(response.data))
    .finally(() => { pending.delete(key) })
  pending.set(key, request)
  return request
}
