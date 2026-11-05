/** 党委门户只按组织任职的职位编码精确判断，不依赖系统角色或职位名称。 */
type PartyPortal = 'party' | 'branch' | 'academy' | 'school'
type Position = { code: string }

const POSITION_PORTALS: Record<string, PartyPortal> = {
  party_branch: 'branch',
  party_committee: 'academy',
  party_sch: 'school',
}

export function getPartyPortalKeyByPositionCode(position: Position): PartyPortal | undefined {
  const code = position.code.trim().toLowerCase()
  return Object.hasOwn(POSITION_PORTALS, code) ? POSITION_PORTALS[code] : undefined
}

/** 多职位时保持原有的支部 → 学院 → 学校优先级。 */
export function resolveDefaultPartyPortalKey(positions: readonly Position[]): PartyPortal {
  const portals = new Set(positions.map(getPartyPortalKeyByPositionCode))
  if (portals.has('branch')) return 'branch'
  if (portals.has('academy')) return 'academy'
  if (portals.has('school')) return 'school'
  return 'party'
}

/** 学校职位可进入学院和支部，学院职位可进入支部。 */
export function getAccessiblePartyPortalKeys(positions: readonly Position[]): PartyPortal[] {
  const portals = new Set(positions.map(getPartyPortalKeyByPositionCode))
  const school = portals.has('school')
  const academy = school || portals.has('academy')
  return [
    'party',
    ...(academy || portals.has('branch') ? ['branch' as const] : []),
    ...(academy ? ['academy' as const] : []),
    ...(school ? ['school' as const] : []),
  ]
}
