/**
 * 「批量添加新成员」表格校验（可复用，代码要求 1）。
 *
 * 输入：xlsx 读出的二维数据 + 系统里的组织 / 身份（职位）/ 系统角色；
 * 输出：可导入的成员 + 逐行问题清单（供弹窗提示与导出报错日志）。
 *
 * 约定：
 * - 从样表第 5 行开始读数据（第 1 行表头、第 2 行说明、第 3–4 行示例）；
 * - 分隔符同时兼容中英文：全角「：」「；」「／」「，」「（）」会先归一化成半角；
 * - 「组织:身份」写作「组织ID：身份编码」或「组织code：身份编码」，按第一条数据确定整表格式；多身份用「/」、多组织用「；」分隔；
 * - 组织 ID / 身份编码 / 系统角色 ID 必须在系统里存在；身份还必须已向该组织开放
 *   （按职位的 usage_scope 判断），否则记录为错误，避免提交后才被后端 412 拦截。
 */
import type { OrganizationInfo } from '../api/types/organizations'
import type { PositionDetail } from '../api/types/positions'
import type { RoleInfo } from '../api/types/rbac'
import type { TranslateFn } from '../i18n'
import type { XlsxCellValue } from './xlsxReader'

/** 一条校验问题 */
export interface MemberCheckIssue {
  /** Excel 行号（1 基，必填） */
  row: number
  /** 该行姓名（可能为空字符串，必填） */
  name: string
  /** 出问题的列名（已翻译，必填） */
  field: string
  /** 问题描述（已翻译，含具体值，必填） */
  message: string
}

/** 一行可导入的成员数据 */
export interface ParsedMember {
  /** Excel 行号（1 基，必填） */
  row: number
  /** 用户 ID：创建接口要求前端指定，这里直接取登录账号名（须为纯数字） */
  uid: number
  username: string
  name: string
  /** 男 / 女 / 空 */
  gender: string
  /** 组织与身份（同一组织可多个身份），已校正为系统内的组织 ID 与身份编码 */
  orgIdentities: { orgId: number; positions: string[] }[]
  partyNo: string
  joinTime: string
  phone: string
  email: string
  birthday: string
  /** 系统角色 ID 列表 */
  roleIds: number[]
  password: string
  /** 民族（可空，写入个人档案） */
  ethnic: string
  /** 籍贯（可空，写入个人档案） */
  nativePlace: string
  /** 户口所在地（可空，写入个人档案） */
  householdLocation: string
  /** 户口性质（可空，写入个人档案） */
  householdType: string
}

/** 校验结果 */
export interface MemberCheckResult {
  /** 参与校验的数据行数（跳过整行为空的行） */
  total: number
  /** 校验通过、可导入的成员 */
  members: ParsedMember[]
  /** 全部问题（按行号升序） */
  issues: MemberCheckIssue[]
}

/**
 * 归一化单元格文本：全角标点/字母/数字转半角，去首尾空白，数字转字符串。
 * @param value 单元格值（必填，可为 null）
 * @returns string 归一化后的文本
 */
export function normalizeCellText(value: XlsxCellValue): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'number' ? String(value) : value
  return normalizeSymbols(text)
}

/**
 * 全角符号 / 字符归一化：！-～ 区间的全角字符整体偏移成半角，全角空格转半角空格。
 * @param text 原始文本（必填）
 * @returns string 半角化后的文本
 */
export function normalizeSymbols(text: string): string {
  return text
    .replace(/[\uff01-\uff5e]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, ' ')
    .trim()
}

/** 去掉「（备注名）」这类括号注释，只留前面的编码 */
function stripParenthetical(text: string): string {
  return text.replace(/\([^)]*\)/g, '').trim()
}

/**
 * 判断身份（职位）能否用于指定组织。
 *
 * 与后端规则一致：
 * - 职位在其所属组织内始终可用；
 * - `self_and_children` 可向直属下级组织开放；
 * - `self_and_descendants` 可向所有下级组织开放；
 * - 下级组织的职位不能向上级组织使用。
 *
 * @param position 身份（职位）定义（必填，至少含所属组织与适用范围）
 * @param organizationId 目标组织 ID（必填）
 * @param orgs 组织全量（必填，用于追溯目标组织的上级链）
 * @returns 该身份能否用于目标组织
 */
export function isPositionUsableInOrganization(
  position: Pick<PositionDetail, 'organization_id' | 'usage_scope'>,
  organizationId: number,
  orgs: Pick<OrganizationInfo, 'id' | 'parent_id'>[],
): boolean {
  if (position.organization_id === organizationId) return true
  const parentById = new Map(orgs.map((org) => [org.id, org.parent_id]))
  const visited = new Set<number>([organizationId])
  let current = parentById.get(organizationId) ?? null
  let distance = 1
  while (current != null && !visited.has(current)) {
    if (current === position.organization_id) {
      return (
        position.usage_scope === 'self_and_descendants' ||
        (position.usage_scope === 'self_and_children' && distance === 1)
      )
    }
    visited.add(current)
    current = parentById.get(current) ?? null
    distance += 1
  }
  return false
}

/**
 * 解析「组织:身份」单元格。
 * @param text 已归一化的单元格文本（必填）
 * @returns 解析出的组织与身份，以及无法解析的片段
 */
function parseOrgIdentities(text: string, mode: 'id' | 'code', orgIdByCode: Map<string, number>): {
  entries: { orgId: number; codes: string[] }[]
  problems: { kind: 'segment' | 'org' | 'identity' | 'mode'; value: string }[]
} {
  const entries: { orgId: number; codes: string[] }[] = []
  const problems: { kind: 'segment' | 'org' | 'identity' | 'mode'; value: string }[] = []

  for (const rawSegment of text.split(';')) {
    const segment = rawSegment.trim()
    if (!segment) continue
    const colonIndex = segment.indexOf(':')
    if (colonIndex < 0) {
      problems.push({ kind: 'segment', value: segment })
      continue
    }
    const orgPart = stripParenthetical(segment.slice(0, colonIndex).trim())
    const identityPart = segment.slice(colonIndex + 1).trim()

    const isId = /^[1-9]\d*$/.test(orgPart) && Number.isSafeInteger(Number(orgPart))
    const orgId = mode === 'id' ? (isId ? Number(orgPart) : undefined) : orgIdByCode.get(orgPart)
    if (orgId === undefined) {
      problems.push({ kind: mode === 'id' || isId ? 'mode' : 'org', value: orgPart })
      continue
    }
    const codes = identityPart
      .split('/')
      .map((code) => stripParenthetical(code).trim())
      .filter(Boolean)
    if (codes.length === 0) {
      problems.push({ kind: 'identity', value: identityPart })
      continue
    }
    entries.push({ orgId, codes })
  }

  return { entries, problems }
}

/** 解析日期文本，支持 2025-10-01 / 2025/10/1 / 2025.10.1 / 2025年10月1日 / Excel 序列号 */
function parseDateText(text: string): string | null {
  if (!text) return null
  const match = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/.exec(text)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day))
      if (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      ) {
        const pad = (value: number) => String(value).padStart(2, '0')
        return `${year}-${pad(month)}-${pad(day)}`
      }
    }
    return null
  }
  // 纯数字：可能是没套日期格式的 Excel 序列号（1954–2119 之间才认，避免把 2025 当日期）
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text)
    if (serial >= 20000 && serial <= 80000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000)
      const date = new Date(ms)
      const pad = (value: number) => String(value).padStart(2, '0')
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    }
  }
  return null
}

/**
 * 逐行校验样表数据。
 *
 * 除格式与存在性外，还会按职位的 usage_scope 校验「组织:身份」组合是否合法，
 * 避免分析阶段全部通过、提交时才被后端的 412（该职位不属于目标组织）整批拦截。
 *
 * @param params.rows 工作表二维数据（必填，下标 0 = 第 1 行）
 * @param params.startRow 从第几行开始分析（必填，1 基，通常为 5）
 * @param params.orgs 组织全量（必填）
 * @param params.positions 身份（职位）全量（必填）
 * @param params.roles 系统角色全量（必填）
 * @param params.t 翻译函数（必填）
 * @returns MemberCheckResult 可导入成员与问题清单
 */
export function analyzeMemberRows(params: {
  rows: XlsxCellValue[][]
  startRow: number
  orgs: OrganizationInfo[]
  positions: PositionDetail[]
  roles: RoleInfo[]
  /** 可写入的组织范围；保留 orgs 的祖先链用于判断上级职位的使用范围。 */
  allowedOrgIds?: ReadonlySet<number>
  t: TranslateFn
}): MemberCheckResult {
  const { rows, startRow, orgs, positions, roles, t } = params

  const orgIdSet = new Set(orgs.map((org) => org.id))
  const orgById = new Map(orgs.map((org) => [org.id, org]))
  const orgIdByCode = new Map(orgs.map((org) => [org.code, org.id]))
  // 旧版模板 B 列为初始密码；新版删除该列，组织身份移至 D 列。
  const legacyPasswordColumn = /密码|password/i.test(normalizeCellText(rows[0]?.[1] ?? null))
  const columnCount = legacyPasswordColumn ? 15 : 14
  const orgColumn = legacyPasswordColumn ? 4 : 3
  // 从第一条非空实际数据判断整表格式，跳过模板说明、示例及空行。
  const firstRow = rows.slice(startRow - 1).find((row) => row.slice(0, columnCount).some((cell) => normalizeCellText(cell) !== ''))
  const firstSegment = normalizeCellText(firstRow?.[orgColumn] ?? null).split(';')[0] ?? ''
  const firstOrg = stripParenthetical(firstSegment.split(':')[0] ?? '').trim()
  // 纯数字同时命中 ID 和 code 时优先 ID；仅命中 code 时支持纯数字组织编码。
  const orgMode: 'id' | 'code' = /^[1-9]\d*$/.test(firstOrg) &&
    (orgIdSet.has(Number(firstOrg)) || !orgIdByCode.has(firstOrg)) ? 'id' : 'code'
  const positionByCode = new Map(positions.map((pos) => [pos.code.toUpperCase(), pos]))
  const roleIdSet = new Set(roles.map((role) => role.id))

  const members: ParsedMember[] = []
  const issues: MemberCheckIssue[] = []
  const seenUsernames = new Map<string, number>()
  let total = 0

  for (let rowNumber = startRow; rowNumber <= rows.length; rowNumber += 1) {
    const row = rows[rowNumber - 1] ?? []
    // 前 10 列是账号 / 任职 / 角色信息（旧模板为 11 列），后 4 列是个人档案信息（均可空）
    const cells = Array.from({ length: columnCount }, (_, index) => normalizeCellText(row[index] ?? null))
    // 整行为空（含只有格式没有内容）时跳过，不参与统计也不报错
    if (cells.every((cell) => cell === '')) continue
    total += 1

    if (legacyPasswordColumn) cells.splice(1, 1)
    const [
      username,
      name,
      gender,
      orgIdentity,
      partyNo,
      joinTime,
      phone,
      email,
      birthday,
      roleText,
      ethnic,
      nativePlace,
      householdLocation,
      householdType,
    ] = cells

    const rowIssues: MemberCheckIssue[] = []
    const addIssue = (field: string, message: string) => {
      rowIssues.push({ row: rowNumber, name: name || t('bulkMembers.check.unnamed'), field, message })
    }

    // 登录账号名（同时作为用户 UID：创建接口已要求前端指定 uid，故必须为纯数字）
    if (!username) {
      addIssue(t('bulkMembers.col.username'), t('bulkMembers.check.usernameEmpty'))
    } else if (!/^[1-9]\d*$/.test(username)) {
      addIssue(t('bulkMembers.col.username'), t('bulkMembers.check.usernameNotNumeric'))
    } else if (seenUsernames.has(username)) {
      addIssue(
        t('bulkMembers.col.username'),
        t('bulkMembers.check.usernameDuplicate', {
          value: username,
          row: seenUsernames.get(username) ?? '',
        }),
      )
    } else {
      seenUsernames.set(username, rowNumber)
    }

    // 姓名
    if (!name) addIssue(t('adminUsers.fieldName'), t('bulkMembers.check.nameEmpty'))

    // 性别（可空，填了就必须是男 / 女）
    const normalizedGender: string =
      gender === '男' || gender.toUpperCase() === 'MALE'
        ? '男'
        : gender === '女' || gender.toUpperCase() === 'FEMALE'
          ? '女'
          : ''
    if (gender && !normalizedGender) {
      addIssue(t('adminUsers.fieldGender'), t('bulkMembers.check.gender', { value: gender }))
    }

    // 组织:身份
    const orgEntries: { orgId: number; positions: string[] }[] = []
    if (!orgIdentity) {
      addIssue(t('bulkMembers.col.orgIdentity'), t('bulkMembers.check.orgIdentityEmpty'))
    } else {
      const parsed = parseOrgIdentities(orgIdentity, orgMode, orgIdByCode)
      for (const problem of parsed.problems) {
        if (problem.kind === 'segment') {
          addIssue(
            t('bulkMembers.col.orgIdentity'),
            t('bulkMembers.check.orgSegment', { value: problem.value }),
          )
        } else if (problem.kind === 'mode') {
          addIssue(t('bulkMembers.col.orgIdentity'), t('bulkMembers.check.orgFormatMismatch', { value: problem.value }))
        } else if (problem.kind === 'org') {
          addIssue(t('bulkMembers.col.orgIdentity'), t('bulkMembers.check.orgInvalid', { value: problem.value }))
        } else {
          addIssue(
            t('bulkMembers.col.orgIdentity'),
            t('bulkMembers.check.identityEmpty', { value: problem.value }),
          )
        }
      }
      for (const entry of parsed.entries) {
        if (orgIdSet.has(entry.orgId) && params.allowedOrgIds && !params.allowedOrgIds.has(entry.orgId)) {
          addIssue(t('bulkMembers.col.orgIdentity'), t('bulkMembers.check.orgOutOfScope', { value: String(entry.orgId) }))
          continue
        }
        if (!orgIdSet.has(entry.orgId)) {
          addIssue(
            t('bulkMembers.col.orgIdentity'),
            t('bulkMembers.check.orgNotFound', { value: String(entry.orgId) }),
          )
          continue
        }
        const positionsValid: string[] = []
        for (const code of entry.codes) {
          const position = positionByCode.get(code.toUpperCase())
          if (!position) {
            addIssue(
              t('bulkMembers.col.orgIdentity'),
              t('bulkMembers.check.identityNotFound', { value: code }),
            )
          } else if (!isPositionUsableInOrganization(position, entry.orgId, orgs)) {
            addIssue(
              t('bulkMembers.col.orgIdentity'),
              t('bulkMembers.check.identityNotUsable', {
                code: position.code,
                org: orgById.get(entry.orgId)?.name ?? String(entry.orgId),
              }),
            )
          } else {
            positionsValid.push(position.code)
          }
        }
        if (positionsValid.length > 0) {
          orgEntries.push({ orgId: entry.orgId, positions: positionsValid })
        }
      }
    }

    // 党员编号（可空，填了必须是数字）
    if (partyNo && !/^\d+$/.test(partyNo)) {
      addIssue(t('bulkMembers.col.partyNo'), t('bulkMembers.check.partyNo', { value: partyNo }))
    }

    // 入党时间（可空，填了必须是有效日期）
    const joinTimeValue = joinTime ? parseDateText(joinTime) : ''
    if (joinTime && !joinTimeValue) {
      addIssue(t('bulkMembers.col.joinTime'), t('bulkMembers.check.joinTime', { value: joinTime }))
    }

    // 电话（可空，填了必须是 11 位手机号）
    const phoneValue = phone.replace(/[\s-]/g, '')
    if (phoneValue && !/^1[3-9]\d{9}$/.test(phoneValue)) {
      addIssue(t('adminUsers.fieldPhone'), t('bulkMembers.check.phone', { value: phone }))
    }

    // 邮箱（可空，填了必须合法）
    if (email && !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
      addIssue(t('adminUsers.fieldEmail'), t('bulkMembers.check.email', { value: email }))
    }

    // 生日（可空，填了必须是有效日期）
    const birthdayValue = birthday ? parseDateText(birthday) : ''
    if (birthday && !birthdayValue) {
      addIssue(t('adminUsers.fieldBirthday'), t('bulkMembers.check.birthday', { value: birthday }))
    }

    // 系统角色（可空；写角色 ID 数字）
    const roleIds: number[] = []
    if (roleText) {
      for (const part of roleText.split(/[/,、，]/)) {
        const code = stripParenthetical(part.trim())
        if (!code) continue
        if (!/^\d+$/.test(code)) {
          addIssue(t('bulkMembers.col.roles'), t('bulkMembers.check.roleInvalid', { value: code }))
          continue
        }
        const roleId = Number(code)
        if (!roleIdSet.has(roleId)) {
          addIssue(t('bulkMembers.col.roles'), t('bulkMembers.check.roleNotFound', { value: code }))
        } else {
          roleIds.push(roleId)
        }
      }
    }

    // 初始密码（必填）


    issues.push(...rowIssues)
    if (rowIssues.length === 0) {
      members.push({
        row: rowNumber,
        uid: Number(username),
        username,
        name,
        gender: normalizedGender,
        orgIdentities: orgEntries,
        partyNo,
        joinTime: joinTimeValue || '',
        phone: phoneValue,
        email,
        birthday: birthdayValue || '',
        roleIds,
        password: '',
        ethnic,
        nativePlace,
        householdLocation,
        householdType,
      })
    }
  }

  issues.sort((a, b) => a.row - b.row)
  return { total, members, issues }
}
