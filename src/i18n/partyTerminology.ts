/**
 * 党委门户共用管理组件时的展示用语；不改接口字段或返回的身份名称。
 * @param key 类型：string；默认值：无；是否必填：必填
 * @param text 类型：string；默认值：无；是否必填：必填
 * @param locale 类型：'zh' | 'en'；默认值：无；是否必填：必填
 * @returns 类型：string
 */
export function partyTerminology(key: string, text: string, locale: 'zh' | 'en'): string {
  const overrides: Record<string, [string, string]> = {
    'portal.school_m5': ['身份管理', 'Identity Management'],
    'approvalTemplate.colStepPosition': ['审批人身份', 'Approver identity'],
    'approvalTemplate.fieldStepPosition': ['审批人身份', 'Approver identity'],
    'approvalTemplate.fieldStepAssigneePlaceholder': ['如用户 ID，留空则按身份匹配', 'User ID; leave blank to match by identity'],
  }
  const override = overrides[key]
  if (override) return override[locale === 'zh' ? 0 : 1]
  if (locale === 'zh') return text.replaceAll('职位', '身份')
  return text.replace(/\bpositions?\b/gi, (word) => {
    const identity = word.toLowerCase() === 'positions' ? 'identities' : 'identity'
    return word[0] === word[0].toUpperCase()
      ? identity[0].toUpperCase() + identity.slice(1)
      : identity
  })
}
