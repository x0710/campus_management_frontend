import { isCreatedDateInRange } from '../utils/dateQuery'
import type { CreatedDateQuery } from './types/common'
/** 页面统一读取层：真实数据在缓存中，模拟数据仅在返回页面前合并。 */
import { CanceledError } from 'axios'
import { activeImportPreview } from '../store/importPreview'
import type { ImportPreview } from '../store/importPreview'

type Row = Record<string, unknown>
type Params = Record<string, unknown>
type Load = (url: string, params?: Params) => Promise<unknown>
const ids = (value: unknown) => value == null ? null : new Set(String(value).split(',').map(Number))
const pageOf = (data: Row[], params: Params) => {
  const page = Math.max(1, Number(params.page) || 1), size = Math.max(1, Number(params.page_size) || 100)
  return { data: data.slice((page - 1) * size, page * size), total: data.length,
    page, page_size: size, total_pages: Math.ceil(data.length / size) }
}
async function allPages(load: Load, url: string, params: Params): Promise<Row[]> {
  const data: Row[] = []
  for (let page = 1; ; page++) {
    const result = await load(url, { ...params, page, page_size: 100 }) as { data: Row[]; total_pages: number }
    data.push(...result.data)
    if (!result.data.length || page >= result.total_pages) break
  }
  return data
}
function userFields(member: ImportPreview['members'][number]) {
  return Object.fromEntries(Object.entries({
    name: member.name || undefined, gender: member.gender === '男' ? 'male' : member.gender === '女' ? 'female' : undefined,
    phone: member.phone || undefined, email: member.email || undefined, birthday: member.birthday || undefined,
  }).filter(([, value]) => value !== undefined))
}
function memberships(preview: ImportPreview, params: Params = {}): Row[] {
  let id = -1
  const rows = preview.members.flatMap((member) => member.orgIdentities.flatMap((org) => org.positions.map((position) => ({
    id: id--, user_id: member.uid, position, organization_id: org.orgId,
    organization_name: preview.organizations.find((item) => item.id === org.orgId)?.name ?? '',
    workplace: '', created_at: preview.startedAt,
  }))))
  return rows.filter((row) => isCreatedDateInRange(row.created_at, params as CreatedDateQuery))
}
function appendMemberships(real: Row[], added: Row[], scopedOrg?: number) {
  const key = (row: Row) => `${row.organization_id ?? scopedOrg}:${row.user_id}:${row.position}`
  const merged = new Map(real.map((row) => [key(row), row]))
  for (const row of added) if (!merged.has(key(row))) merged.set(key(row), row)
  return [...merged.values()]
}
const detailDefaults = (id: number, time: string): Row => ({ id, name: null, gender: null, phone: null,
  email: null, birthday: null, avatar: null, created_at: time, updated_at: time })

export async function readPreviewData<T>(url: string, params: Params | undefined, load: Load): Promise<T> {
  const preview = activeImportPreview()
  if (!preview) return await load(url, params) as T
  const result = await mergePreview(url, params ?? {}, load, preview)
  // 开始/退出模拟或切换账号后，旧的在途合并结果不能显示在新视图。
  if (activeImportPreview() !== preview) throw new CanceledError('Preview changed')
  return result as T
}
async function mergePreview(url: string, params: Params, load: Load, preview: ImportPreview): Promise<unknown> {
  const requested = ids(params.uids ?? params.ids)
  const selected = preview.members.filter((member) => !requested || requested.has(member.uid))
  if (url === '/users') {
    const { keyword: _keyword, ...query } = params
    const real = await allPages(load, url, query)
    const merged = new Map(real.map((row) => [Number(row.uid), row]))
    for (const member of selected) {
      const existing = merged.get(member.uid)
      if ((params.start_date || params.end_date) && !existing &&
        (preview.existingUids.has(member.uid) || !isCreatedDateInRange(preview.startedAt, params as CreatedDateQuery))) continue
      if (params.status && preview.existingUids.has(member.uid) && !merged.has(member.uid)) continue
      if (params.status && params.status !== 'enabled' && !merged.has(member.uid)) continue
      merged.set(member.uid, { created_at: preview.startedAt, ...merged.get(member.uid), uid: member.uid,
        name: member.name || merged.get(member.uid)?.name || null })
    }
    const keyword = String(params.keyword ?? '').trim().toLowerCase()
    return pageOf([...merged.values()].filter((row) => !keyword || String(row.name ?? '').toLowerCase().includes(keyword)), params)
  }
  const detail = /^\/users\/(\d+)$/.exec(url)
  if (detail) {
    const member = preview.members.find((item) => item.uid === Number(detail[1]))
    if (member) {
      const real = preview.existingUids.has(member.uid) ? await load(url, params) as Row : detailDefaults(member.uid, preview.startedAt)
      return { ...real, ...userFields(member) }
    }
  }
  const credential = /^\/credentials\/(\d+)$/.exec(url)
  if (credential) {
    const member = preview.members.find((item) => item.uid === Number(credential[1]))
    if (member && !preview.existingUids.has(member.uid)) return { uid: member.uid, username: member.username, status: 'enabled', last_login_at: null }
  }
  const orgMembers = /^\/organizations\/(\d+)\/members$/.exec(url)
  if (orgMembers) {
    const orgId = Number(orgMembers[1])
    const real = await allPages(load, url, params)
    const added = memberships(preview, params).filter((row) => row.organization_id === orgId &&
      (!params.user_id || row.user_id === Number(params.user_id)) && (!requested || requested.has(Number(row.user_id))) &&
      (!params.position || params.position === row.position))
    return pageOf(appendMemberships(real, added, orgId), params)
  }
  if (url === '/organization-members') {
    const real = await load(url, params) as Row[]
    return appendMemberships(real, memberships(preview, params).filter((row) => !requested || requested.has(Number(row.user_id))))
  }
  if (url === '/party/profiles') {
    const real = await load(url, params) as Row[]
    const merged = new Map(real.map((row) => [Number(row.user_id), row]))
    for (const member of selected) merged.set(member.uid, { party_no: null, join_time: null, ...merged.get(member.uid), user_id: member.uid,
      ...(member.partyNo ? { party_no: Number(member.partyNo) } : {}), ...(member.joinTime ? { join_time: member.joinTime } : {}) })
    return [...merged.values()]
  }
  if (url === '/profile-details') {
    const real = await allPages(load, url, { ...params, keyword: undefined })
    const merged = new Map(real.map((row) => [Number(row.user_id), row]))
    for (const member of selected) {
      if (params.user_id && Number(params.user_id) !== member.uid) continue
      const extras = { ethnic: member.ethnic, native_place: member.nativePlace,
        household_location: member.householdLocation, household_type: member.householdType }
      if (!Object.values(extras).some(Boolean)) continue
      merged.set(member.uid, { id: -member.uid, user_id: member.uid, ...merged.get(member.uid),
        ...Object.fromEntries(Object.entries(extras).filter(([, value]) => value)) })
    }
    const keyword = String(params.keyword ?? '').toLowerCase()
    return pageOf([...merged.values()].filter((row) => !keyword || [row.id_card, row.native_place].some((value) => String(value ?? '').toLowerCase().includes(keyword))), params)
  }
  if (url === '/rbac/users/roles') {
    const real = await load(url, params) as Row[]
    const replacements = new Map(selected.filter((member) => member.roleIds.length).map((member) => [member.uid, member]))
    return [...real.filter((row) => !replacements.has(Number(row.uid))), ...[...replacements.values()].flatMap((member) => member.roleIds.flatMap((id) => {
      const role = preview.roles.find((item) => item.id === id)
      return role ? [{ ...role, uid: member.uid }] : []
    }))]
  }
  if (url === '/user-positions') {
    const real = await load(url, params) as Row[]
    const added = memberships(preview, params).filter((row) => !requested || requested.has(Number(row.user_id))).flatMap((row) => {
      const position = preview.positions.find((item) => item.code === row.position)
      return position ? [{ ...position, uid: row.user_id, member_organization_id: row.organization_id }] : []
    })
    const key = (row: Row) => `${row.uid}:${row.member_organization_id}:${row.code}`
    return [...new Map([...added, ...real].map((row) => [key(row), row])).values()]
  }
  return load(url, params)
}
