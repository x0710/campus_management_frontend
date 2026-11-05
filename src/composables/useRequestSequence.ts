import { useEffect, useState } from 'react'
import { createRequestSequence } from '../utils/requestSequence'
import { useAuthStore } from '../store/auth'

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
