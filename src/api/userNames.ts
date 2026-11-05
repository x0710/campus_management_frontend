import axios, { CanceledError } from 'axios'
import { queryUsers } from './users'
import { USER_NAME_BATCH_SIZE } from '../config/userNames'

/** 批量查询姓名；列表漏项或姓名为空时保留空值。仅查询传入的用户 ID。 */
export async function resolveUserNames(
  ids: readonly number[],
  isCurrent: () => boolean = () => true,
): Promise<{ names: Map<number, string | null>; error?: unknown }> {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))]
  const names = new Map<number, string | null>(uniqueIds.map((id) => [id, null]))
  let failure: unknown
  const assertCurrent = () => { if (!isCurrent()) throw new CanceledError('Session or name request changed') }
  const isAuthenticationError = (error: unknown) => axios.isCancel(error) ||
    (axios.isAxiosError(error) && error.response?.status === 401)

  for (let start = 0; start < uniqueIds.length; start += USER_NAME_BATCH_SIZE) {
    const batch = uniqueIds.slice(start, start + USER_NAME_BATCH_SIZE)
    const requested = new Set(batch)
    try {
      for (let page = 1; ; page += 1) {
        assertCurrent()
        const result = await queryUsers({ ids: batch.join(','), page, page_size: batch.length })
        assertCurrent()
        for (const user of result.data) {
          if (requested.has(user.uid)) names.set(user.uid, user.name?.trim() || null)
        }
        if (!result.data.length || page >= result.total_pages) break
      }
    } catch (error) {
      assertCurrent()
      if (isAuthenticationError(error)) throw error
      failure ??= error
    }
  }

  return { names, ...(failure ? { error: failure } : {}) }
}
