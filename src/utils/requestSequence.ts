/** 每次请求取得独立凭据；刷新、切换目标或卸载后，旧请求不得写入状态。 */
export function createRequestSequence() {
  let sequence = 0
  return {
    begin() {
      const current = ++sequence
      return () => current === sequence
    },
    invalidate() { sequence += 1 },
  }
}
