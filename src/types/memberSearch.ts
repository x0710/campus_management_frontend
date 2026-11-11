/** 成员搜索跨页面、会话 UI 状态共享的数据类型。 */
export interface MemberSearchHit {
  uid: number
  name: string | null
  targetId: number
  orgName: string
}
