import { positionNamesResource } from '../store/referenceData'
import { useSharedResource } from './useSharedResource'

/** 所有组件共享同一份职位映射；职位变更后自动重新加载并通知已挂载组件。 */
export function usePositionNames(): Map<string, string> {
  return useSharedResource(positionNamesResource).data
}
