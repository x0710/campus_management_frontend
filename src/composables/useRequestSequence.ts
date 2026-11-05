/** 请求序号 hook：丢弃过期响应，避免并发请求竞态覆盖状态。 */

import { useEffect, useState } from 'react'
import { createRequestSequence } from '../utils/requestSequence'
import { useAuthStore } from '../store/auth'

/**
 * useRequestSequence 的参数与返回值说明。
 * @returns 类型：{ begin(): () => boolean; invalidate: () => void; }
 */
export function useRequestSequence() {
  const [requests] = useState(() => {
    const sequence = createRequestSequence()
    const token = useAuthStore.getState().token
    return {
      begin() {
        const isLatest = sequence.begin()
        return () => isLatest() && useAuthStore.getState().token === token
      },
      invalidate: sequence.invalidate,
    }
  })
  useEffect(() => () => requests.invalidate(), [requests])
  return requests
}
