import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toCreatedDateQuery, toCreatedDateAliases, isCreatedDateInRange } from '../src/utils/dateQuery.ts'
import { http } from '../src/api/http.ts'
import { invalidate } from '../src/api/cache.ts'
import { queryPartyScores, queryPartyScoreApprovals } from '../src/api/partyScores.ts'
import { queryAnnouncements, listAllAnnouncements, getAnnouncementReaders } from '../src/api/announcements.ts'
import { queryApprovals, getApprovalRecords } from '../src/api/approvals.ts'
import { queryEvents, queryEventsInRange } from '../src/api/calendars.ts'
import { queryCourses } from '../src/api/courses.ts'
import { queryScores, listAllScoresForUser } from '../src/api/examinations.ts'
import { queryFeedbacks } from '../src/api/feedbacks.ts'
import { queryLeaves } from '../src/api/leaves.ts'
import { queryNotices } from '../src/api/notices.ts'
import { queryOrganizations, queryOrgMembers, listAllOrganizations, listSubsidiaries, listUserOrganizationsBatch } from '../src/api/organizations.ts'
import { queryPositions, queryUserPositions } from '../src/api/positions.ts'
import { queryProfileDetails } from '../src/api/profileDetails.ts'
import { queryRecords } from '../src/api/records.ts'
import { queryRewardings } from '../src/api/rewardings.ts'
import { queryStudents } from '../src/api/students.ts'
import { queryUsers } from '../src/api/users.ts'
import { queryViolations } from '../src/api/violations.ts'
import { findMemberPage } from '../src/composables/useMemberSearch.ts'
import { fetchMemberInfoExportRows } from '../src/utils/memberInfoExport.ts'

const dates = { start_date: '2026-11-01', end_date: '2026-11-11' }
const page = (config, data = [], totalPages = 1) => ({ config, status: 200, statusText: 'OK', headers: {},
  data: { data, page: config.params?.page ?? 1, page_size: 100, total: data.length, total_pages: totalPages } })
async function isolated(run) {
  const original = http.defaults.adapter
  invalidate()
  try { await run() } finally { http.defaults.adapter = original; invalidate() }
}

test('日期查询保留日历日期、单边范围和同一天，清空后不发送日期参数', () => {
  assert.deepEqual(toCreatedDateQuery('2026-11-11', '2026-11-11'), { start_date: '2026-11-11', end_date: '2026-11-11' })
  assert.deepEqual(toCreatedDateQuery('2026-11-11', ''), { start_date: '2026-11-11' })
  assert.deepEqual(toCreatedDateQuery(null, '2026-11-11'), { end_date: '2026-11-11' })
  assert.deepEqual(toCreatedDateQuery('', ''), {})
  assert.deepEqual(toCreatedDateAliases(dates), { created_start_date: '2026-11-01', created_end_date: '2026-11-11' })
  assert.deepEqual(toCreatedDateAliases({}), {})
  const oneDay = { start_date: '2026-11-11', end_date: '2026-11-11' }
  assert.equal(isCreatedDateInRange('2026-11-11T00:00:00Z', oneDay), true)
  assert.equal(isCreatedDateInRange('2026-11-11T23:59:59.999Z', oneDay), true)
  assert.equal(isCreatedDateInRange('2026-11-11T00:00:00+08:00', oneDay), false)
  assert.equal(isCreatedDateInRange('2026-11-12T00:00:00Z', oneDay), false)
})

test('新增创建日期参数透传到各列表接口，保留其他查询条件', async () => isolated(async () => {
  const calls = []
  http.defaults.adapter = async (config) => { calls.push(config); return page(config) }
  const queries = [queryAnnouncements, queryEvents, queryCourses, queryScores, queryFeedbacks, queryNotices,
    queryOrganizations, queryPartyScores, queryPositions, queryProfileDetails, queryRecords, queryRewardings, queryStudents, queryUsers]
  for (const query of queries) await query({ ...dates, page: 2, page_size: 10, keyword: 'search' }, true)
  for (const config of calls) {
    assert.equal(config.params.start_date, dates.start_date, config.url)
    assert.equal(config.params.end_date, dates.end_date, config.url)
    assert.equal(config.params.page, 2)
    assert.equal(config.params.keyword, 'search')
  }
  await queryLeaves({ ...toCreatedDateAliases(dates), start_date: '2026-12-01T00:00:00Z' }, true)
  await queryViolations({ ...toCreatedDateAliases(dates), start_date: '2026-12-01T00:00:00Z' }, true)
  for (const config of calls.slice(-2)) {
    assert.equal(config.params.created_start_date, dates.start_date)
    assert.equal(config.params.created_end_date, dates.end_date)
    assert.equal(config.params.start_date, '2026-12-01T00:00:00Z')
  }
}))

test('审批列表将日期应用于审批实例查询，业务归属反查不额外施加日期条件', async () => isolated(async () => {
  const calls = []
  http.defaults.adapter = async (config) => {
    calls.push(config)
    if (config.url === '/approvals') return { ...page(config), data: [{ id: 1, instance_id: 17 }] }
    return page(config, [{ id: 3, approval_instance_id: 17 }])
  }
  const result = await queryPartyScoreApprovals({ ...dates, approver_id: 7, page: 1, page_size: 10 }, true)
  assert.equal(result.length, 1)
  const approval = calls.find((call) => call.url === '/approvals')
  assert.equal(approval.params.start_date, dates.start_date)
  assert.equal(approval.params.end_date, dates.end_date)
  const lookup = calls.find((call) => call.url === '/party-scores')
  assert.equal(lookup.params.approval_instance_id, 17)
  assert.equal(lookup.params.start_date, undefined)
  await queryApprovals({ ...dates, approver_id: 7 })
  assert.equal(calls.at(-1).params.start_date, dates.start_date)
}))

test('公告、组织、成绩和日历聚合查询的每一页均保持日期筛选', async () => isolated(async () => {
  const calls = []
  http.defaults.adapter = async (config) => { calls.push(config); return page(config, [{ id: 1, created_at: '2026-11-05' }], 2) }
  await listAllAnnouncements(true, undefined, dates)
  await listAllOrganizations(true, dates)
  await listAllScoresForUser(7, true, undefined, dates)
  await queryEventsInRange({ ...dates, from_date: '2026-11-01T00:00:00Z', to_date: '2026-12-01T00:00:00Z' }, true)
  assert.equal(calls.length, 8)
  for (const config of calls) {
    assert.equal(config.params.start_date, dates.start_date, config.url)
    assert.equal(config.params.end_date, dates.end_date, config.url)
  }
  for (const config of calls.filter((call) => call.url === '/calendars')) {
    assert.equal(config.params.from_date, '2026-11-01T00:00:00Z')
  }
}))

test('成员、任职、已读人员和审批意见查询均支持日期参数', async () => isolated(async () => {
  const calls = []
  http.defaults.adapter = async (config) => { calls.push(config); return page(config) }
  await queryOrgMembers(2, { ...dates, page: 1 }, true)
  await listUserOrganizationsBatch([7], true, false, dates)
  await listSubsidiaries(2, dates)
  await queryUserPositions([7], true, dates)
  await getAnnouncementReaders(3, true, dates)
  await getApprovalRecords(4, true, dates)
  for (const config of calls) assert.equal(config.params.start_date, dates.start_date, config.url)
}))

test('不同日期范围使用独立缓存，清空后重新读取未筛选的数据', async () => isolated(async () => {
  const calls = []
  http.defaults.adapter = async (config) => { calls.push(config); return page(config) }
  await queryPartyScores(dates)
  await queryPartyScores(dates)
  await queryPartyScores({ start_date: '2026-10-01' })
  await queryPartyScores({})
  assert.equal(calls.length, 3)
  assert.equal(calls.at(-1).params.start_date, undefined)
  assert.equal(calls.at(-1).params.end_date, undefined)
}))

test('组织成员搜索按相同日期条件扫描页码，避免定位到筛选范围外的页', async () => isolated(async () => {
  const calls = []
  http.defaults.adapter = async (config) => {
    calls.push(config)
    return page(config, config.params.page === 1 ? [{ user_id: 1 }, { user_id: 2 }] : [{ user_id: 7 }], 2)
  }
  assert.equal(await findMemberPage(2, 7, 2, dates), 2)
  assert.equal(calls.length, 2)
  for (const config of calls) {
    assert.equal(config.params.start_date, dates.start_date)
    assert.equal(config.params.end_date, dates.end_date)
  }
}))

test('包含下级组织的成员导出继续使用当前创建日期范围', async () => isolated(async () => {
  const calls = []
  http.defaults.adapter = async (config) => {
    calls.push(config)
    return page(config, [{ user_id: 7, position: 'member' }])
  }
  const rows = await fetchMemberInfoExportRows({ orgId: 1, includeChildren: true, dates,
    orgs: [{ id: 1, name: '党委' }, { id: 2, parent_id: 1, name: '支部' }] })
  assert.equal(rows.length, 1)
  assert.equal(calls.length, 2)
  for (const config of calls) {
    assert.equal(config.params.start_date, dates.start_date)
    assert.equal(config.params.end_date, dates.end_date)
  }
}))
