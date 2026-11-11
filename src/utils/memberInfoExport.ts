/**
 * 支部端「支部管理」导出：一张工作簿、两个工作表。
 *   1. 「党员信息」：基本信息 + 个人资料 + 党员信息；
 *   2. 「成绩信息」：姓名 + 成绩 + 加分和减分事项。
 *
 * 数据来源：
 *   - 基本信息：GET /api/users?ids=（批量，分块 100；列表仅返回 uid/name 时，
 *     性别按个人档案身份证号推导，生日回退个人档案 birth_date）；
 *   - 手机 / 邮箱：基本信息缺失时回退个人档案；
 *   - 账户名：直接取组织成员查询返回的 user_id（本系统登录账号名即 UID），不再请求 /credentials/{uid}；
 *   - 个人资料：GET /api/profile-details?uids=（批量，分块 100）；
 *   - 党员信息：GET /api/party/profiles?uids=（批量，分块 100）；
 *   - 成绩：GET /api/party/scores?uids=（批量总数）+ GET /api/party-scores?uids=（事项明细，
 *     列表缺 reason 时再用 GET /api/party-scores/{id} 取详情）。
 *
 * 后续二级党委端 / 学校党委端复用本函数，只需传入各自的成员范围。
 */
import { queryOrgMembers } from '../api/organizations'
import { queryPartyProfiles } from '../api/partyProfiles'
import { queryProfileDetails } from '../api/profileDetails'
import { getPartyScore, getPartyScoreTotals, queryPartyScores } from '../api/partyScores'
import { queryUsers } from '../api/users'
import type { PartyProfile } from '../api/types/partyProfiles'
import type { ProfileDetail } from '../api/types/profileDetails'
import type { PartyScore } from '../api/types/partyScores'
import type { UserDetail, UserInfo } from '../api/types/users'
import type { TranslateFn } from '../i18n'
import { formatDateOnly } from './datetime'
import { listOrgDescendantIds } from './orgTree'
import { genderFromIdCard, normalizeGender } from './gender'
import { formatPartyScore, formatPartyScoreTotal, isPartyScoreDeduction } from './partyScore'
import { downloadXlsx, type XlsxSheet } from './xlsx'

/** 导出所需的成员行（与 groupOrganizationMembers 的合并行兼容） */
export interface MemberInfoExportRow {
  user_id: number
  positions: string[]
  /** 该成员实际所属组织（包含下级组织导出时按实际组织拼接；不传时统一用 options.orgName） */
  organizationName?: string
}

/**
 * 按组织范围拉取导出用的成员行。
 * - includeChildren=false：只拉当前组织成员；
 * - includeChildren=true：拉当前组织 + 全部下级组织成员，按用户合并职位并拼接实际所属组织。
 * @param options 组织集合、当前组织 ID 与是否包含下级组织（必填）
 * @returns Promise<MemberInfoExportRow[]> 合并后的成员行（顺序按组织遍历的首次出现）
 */
export async function fetchMemberInfoExportRows(options: {
  orgs: Array<{ id: number; name: string; parent_id?: number | null }>
  orgId: number
  includeChildren: boolean
  dates?: import('../api/types/common').CreatedDateQuery
}): Promise<MemberInfoExportRow[]> {
  const { orgs, orgId, includeChildren } = options
  const orgIds = includeChildren ? [orgId, ...listOrgDescendantIds(orgs, orgId)] : [orgId]
  const byUser = new Map<number, { positions: string[]; orgNames: string[] }>()
  for (const id of orgIds) {
    const orgName = orgs.find((org) => org.id === id)?.name ?? `#${id}`
    let page = 1
    let totalPages = 1
    do {
      const res = await queryOrgMembers(id, { ...options.dates, page, page_size: BATCH_SIZE })
      for (const member of res.data) {
        const entry = byUser.get(member.user_id) ?? { positions: [], orgNames: [] }
        const position = member.position?.trim()
        if (position && !entry.positions.includes(position)) entry.positions.push(position)
        if (!entry.orgNames.includes(orgName)) entry.orgNames.push(orgName)
        byUser.set(member.user_id, entry)
      }
      totalPages = res.total_pages
      page += 1
    } while (page <= totalPages)
  }
  return [...byUser.entries()].map(([user_id, entry]) => ({
    user_id,
    positions: entry.positions,
    organizationName: entry.orgNames.join('、'),
  }))
}

export interface MemberInfoExportOptions {
  /** 所属组织名称（必填，写入「所属组织」列与文件名） */
  orgName: string
  /** 成员行（必填；调用方按当前筛选结果传入） */
  members: MemberInfoExportRow[]
  /** 职位编码 → 展示名称（必填） */
  positionLabel: (code: string) => string
  /** 翻译函数（必填） */
  t: TranslateFn
}

/** 批量接口单次最多 100 个 ID */
const BATCH_SIZE = 100
/** 详情补取等并发请求的上限 */
const CONCURRENCY = 8

/**
 * 把数组按固定大小切块。
 * @param items 原始数组（必填）
 * @returns 分块后的数组
 */
function chunks<T>(items: T[]): T[][] {
  const result: T[][] = []
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    result.push(items.slice(start, start + BATCH_SIZE))
  }
  return result
}

/**
 * 以固定并发度执行异步任务。
 * @param items 任务参数数组（必填）
 * @param limit 最大并发数（必填）
 * @param run 单个任务（必填）
 */
async function runLimited<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await run(current)
    }
  })
  await Promise.all(workers)
}

/**
 * 日期文本：空值返回空串，格式化为 YYYY-MM-DD（导出表格里不用「—」占位）。
 * @param value 后端日期字符串（可空）
 * @returns string 导出用文本
 */
function dateText(value: string | null | undefined): string {
  if (!value) return ''
  const text = formatDateOnly(value)
  return text === '—' ? '' : text
}

/**
 * 批量用户基本信息（`GET /api/users?ids=` 返回 uid/name；若接口后续直接返回详情字段也可透传使用，
 * 缺失的性别 / 生日 / 手机 / 邮箱回退个人档案）。
 */
type BatchUserInfo = UserInfo &
  Partial<Pick<UserDetail, 'email' | 'phone' | 'birthday' | 'gender'>>

/**
 * 批量取用户基本信息（按 100 个 UID 分块，单块失败时留空，不中断整表导出）。
 * 不再逐个请求 `GET /api/users/{id}`，避免成员多时产生大量单用户请求。
 * @param uids 用户 ID 列表（必填）
 * @returns Promise<Map<number, BatchUserInfo>> 用户 ID → 基本信息
 */
async function fetchUserMap(uids: number[]): Promise<Map<number, BatchUserInfo>> {
  const map = new Map<number, BatchUserInfo>()
  for (const chunk of chunks(uids)) {
    const requested = new Set(chunk)
    try {
      let page = 1
      let totalPages = 1
      do {
        const res = await queryUsers({ page, page_size: chunk.length, ids: chunk.join(',') })
        for (const user of res.data) {
          if (requested.has(user.uid)) map.set(user.uid, user as BatchUserInfo)
        }
        totalPages = res.total_pages
        page += 1
      } while (page <= totalPages)
    } catch {
      // 该批用户信息取不到时留空，不影响其余成员导出
    }
  }
  return map
}

/**
 * 批量取个人资料（民族 / 籍贯 / 户口所在地 / 户口性质）。
 * @param uids 用户 ID 列表（必填）
 * @returns Promise<Map<number, ProfileDetail>> 用户 ID → 个人档案
 */
async function fetchProfileMap(uids: number[]): Promise<Map<number, ProfileDetail>> {
  const map = new Map<number, ProfileDetail>()
  for (const chunk of chunks(uids)) {
    try {
      let page = 1
      let totalPages = 1
      do {
        const res = await queryProfileDetails({
          page,
          page_size: BATCH_SIZE,
          uids: chunk.join(','),
        })
        for (const profile of res.data) map.set(profile.user_id, profile)
        totalPages = res.total_pages
        page += 1
      } while (page <= totalPages)
    } catch {
      // 个人资料查询失败时留空（可能无权限），其它工作表照常导出
    }
  }
  return map
}

/**
 * 批量取党员信息（党员编号 / 入党时间）。
 * @param uids 用户 ID 列表（必填）
 * @returns Promise<Map<number, PartyProfile>> 用户 ID → 党员档案
 */
async function fetchPartyProfileMap(uids: number[]): Promise<Map<number, PartyProfile>> {
  const map = new Map<number, PartyProfile>()
  for (const chunk of chunks(uids)) {
    try {
      const profiles = await queryPartyProfiles(chunk)
      for (const profile of profiles) map.set(profile.user_id, profile)
    } catch {
      // 党员档案查询失败时留空
    }
  }
  return map
}

/**
 * 批量取成绩总分。
 * @param uids 用户 ID 列表（必填）
 * @returns Promise<Map<number, string>> 用户 ID → 总分（DecimalText 字符串）
 */
async function fetchScoreTotalMap(uids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  try {
    const items = await getPartyScoreTotals(uids, true)
    for (const [uid, total] of items) map.set(uid, total)
  } catch {
    // 总分查询失败时「成绩」列留空
  }
  return map
}

/**
 * 批量取加分 / 减分事项明细；列表缺少 reason 时补取详情。
 * @param uids 用户 ID 列表（必填）
 * @returns Promise<PartyScore[]> 该批成员的全部事项记录
 */
async function fetchScoreRecords(uids: number[]): Promise<PartyScore[]> {
  const records: PartyScore[] = []
  for (const chunk of chunks(uids)) {
    try {
      let page = 1
      let totalPages = 1
      do {
        const res = await queryPartyScores({
          page,
          page_size: BATCH_SIZE,
          uids: chunk.join(','),
        })
        records.push(...res.data)
        totalPages = res.total_pages
        page += 1
      } while (page <= totalPages)
    } catch {
      // 事项查询失败时「加分和减分事项」列留空
    }
  }
  // 列表摘要可能不含 reason：只对计入成绩的记录（已核定）补取详情（带会话缓存）
  await runLimited(
    records.filter((record) => record.approved_score !== null && record.reason === undefined),
    CONCURRENCY,
    async (record) => {
      try {
        const detail = await getPartyScore(record.id)
        record.reason = detail.reason
      } catch {
        record.reason = ''
      }
    },
  )
  return records
}

/**
 * 导出支部成员的党员信息与成绩信息（两个工作表）。
 * @param options 组织名、成员行、职位名称映射与翻译函数（必填）
 * @returns Promise<void> 触发浏览器下载
 */
export async function exportMemberInfoXlsx(options: MemberInfoExportOptions): Promise<void> {
  const { orgName, members, positionLabel, t } = options
  const uids = Array.from(new Set(members.map((member) => member.user_id)))

  const [userMap, profileMap, partyProfileMap, scoreTotalMap, scoreRecords] = await Promise.all([
    fetchUserMap(uids),
    fetchProfileMap(uids),
    fetchPartyProfileMap(uids),
    fetchScoreTotalMap(uids),
    fetchScoreRecords(uids),
  ])

  // 事项按成员归组，并按创建时间正序排列
  const recordsByUid = new Map<number, PartyScore[]>()
  for (const record of scoreRecords) {
    const list = recordsByUid.get(record.user_id)
    if (list) list.push(record)
    else recordsByUid.set(record.user_id, [record])
  }

  /** 单个成员「加分和减分事项」文本：每行一条，含加减类型、分值、原因、日期 */
  const scoreItemsText = (uid: number): string => {
    // 只有已核定（计入成绩）的加分 / 减分记录才写入事项明细，未核定 / 已驳回的不计入
    const records = (recordsByUid.get(uid) ?? [])
      .filter((record) => record.approved_score !== null)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    if (records.length === 0) return t('branchExport.noScoreItems')
    return records
      .map((record) => {
        const type = isPartyScoreDeduction(record)
          ? t('branchExport.scoreMinus')
          : t('branchExport.scorePlus')
        const score = formatPartyScore(record.approved_score)
        const reason = (record.reason ?? '').trim()
        const date = dateText(record.created_at)
        const base = reason ? `${type} ${score} ${reason}` : `${type} ${score}`
        return date ? `${base}（${date}）` : base
      })
      .join('\n')
  }

  const infoSheet: XlsxSheet = {
    name: t('branchExport.sheetMembers'),
    columns: [
      { header: t('branchExport.colName'), width: 12 },
      { header: t('branchExport.colAccountName'), width: 18 },
      { header: t('branchExport.colGender'), width: 8 },
      { header: t('branchExport.colBirthday'), width: 12 },
      { header: t('branchExport.colPhone'), width: 15 },
      { header: t('branchExport.colEmail'), width: 24 },
      { header: t('branchExport.colOrganization'), width: 24 },
      { header: t('branchExport.colPosition'), width: 20 },
      { header: t('branchExport.colEthnic'), width: 10 },
      { header: t('branchExport.colNativePlace'), width: 16 },
      { header: t('branchExport.colHouseholdLocation'), width: 26 },
      { header: t('branchExport.colHouseholdType'), width: 12 },
      { header: t('branchExport.colPartyNo'), width: 12 },
      { header: t('branchExport.colJoinTime'), width: 12 },
    ],
    rows: members.map((member) => {
      const user = userMap.get(member.user_id)
      const profile = profileMap.get(member.user_id)
      const partyProfile = partyProfileMap.get(member.user_id)
      // 性别优先取用户资料；批量列表不返回性别时按个人档案身份证号推导
      const gender = normalizeGender(user?.gender) ?? genderFromIdCard(profile?.id_card)
      const genderText = gender === 'male'
        ? t('profile.male')
        : gender === 'female'
          ? t('profile.female')
          : ''
      return [
        user?.name?.trim() || `#${member.user_id}`,
        // 本系统登录账号名就是 UID（批量成员导入也把登录账号名直接作为 uid），
        // 直接用组织成员查询返回的 user_id，无需再逐个查 /credentials/{uid}
        String(member.user_id),
        genderText,
        // 生日优先取用户资料，缺失时回退个人档案出生日期
        dateText(user?.birthday) || dateText(profile?.birth_date),
        user?.phone?.trim() || profile?.phone?.trim() || '',
        user?.email?.trim() || profile?.email?.trim() || '',
        member.organizationName?.trim() || orgName,
        member.positions.map((code) => positionLabel(code)).join('、'),
        profile?.ethnic?.trim() || '',
        profile?.native_place?.trim() || '',
        profile?.household_location?.trim() || '',
        profile?.household_type?.trim() || '',
        partyProfile?.party_no == null ? '' : String(partyProfile.party_no),
        dateText(partyProfile?.join_time),
      ]
    }),
  }

  const scoreSheet: XlsxSheet = {
    name: t('branchExport.sheetScores'),
    columns: [
      { header: t('branchExport.colName'), width: 12 },
      { header: t('branchExport.colAccountName'), width: 18 },
      { header: t('branchExport.colScore'), width: 10 },
      { header: t('branchExport.colScoreItems'), width: 70 },
    ],
    rows: members.map((member) => {
      const user = userMap.get(member.user_id)
      const total = scoreTotalMap.get(member.user_id)
      return [
        user?.name?.trim() || `#${member.user_id}`,
        // 登录账号名即 UID（见「党员信息」表同列说明）
        String(member.user_id),
        total ? formatPartyScoreTotal(total) : '',
        scoreItemsText(member.user_id),
      ]
    }),
  }

  downloadXlsx(`${orgName}-${t('branchExport.fileName')}.xlsx`, [infoSheet, scoreSheet])
}
