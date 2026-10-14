import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import MultiSelectHeaderFilter from './MultiSelectHeaderFilter'

/**
 * 党员端：成绩记录表格（含表头多选筛选与成绩排序）。
 * 「成绩申报-我的申报」与「我的-我的成绩记录」共用该模块。
 * 注意：当前为【模拟数据预览页】，后端暂无接口；接口就绪后替换 MOCK_DECLARATIONS 即可。
 */

/** 审批进度 */
type DeclStatus = 'pending' | 'approved' | 'rejected'
/** 等级 */
type DeclLevel = 'national' | 'provincial' | 'municipal' | 'college'

interface MockDeclaration {
  id: string
  /** 类型（i18n key） */
  typeKey: string
  /** 名称（i18n key） */
  nameKey: string
  status: DeclStatus
  level: DeclLevel
  /** 成绩：正数为加分，负数为减分 */
  bonus: number
}

/** 申报内容（模拟数据） */
const MOCK_DECLARATIONS: MockDeclaration[] = [
  { id: 'd1', typeKey: 'partyDeclaration.type_paper', nameKey: 'partyDeclaration.decl_1', status: 'approved', level: 'national', bonus: 8 },
  { id: 'd2', typeKey: 'partyDeclaration.type_patent', nameKey: 'partyDeclaration.decl_2', status: 'pending', level: 'provincial', bonus: 6 },
  { id: 'd3', typeKey: 'partyDeclaration.type_contest', nameKey: 'partyDeclaration.decl_3', status: 'approved', level: 'national', bonus: 10 },
  { id: 'd4', typeKey: 'partyDeclaration.type_project', nameKey: 'partyDeclaration.decl_4', status: 'rejected', level: 'municipal', bonus: 3 },
  { id: 'd5', typeKey: 'partyDeclaration.type_honor', nameKey: 'partyDeclaration.decl_5', status: 'pending', level: 'college', bonus: 2 },
  { id: 'd6', typeKey: 'partyDeclaration.type_software', nameKey: 'partyDeclaration.decl_6', status: 'approved', level: 'provincial', bonus: 5 },
]

/** 审批进度可选项（用于表头筛选） */
const STATUS_KEYS: DeclStatus[] = ['pending', 'approved', 'rejected']
/** 等级可选项（用于表头筛选） */
const LEVEL_KEYS: DeclLevel[] = ['national', 'provincial', 'municipal', 'college']

/** 审批进度标签配色 */
const STATUS_COLOR: Record<DeclStatus, string> = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
}

/** 等级标签配色 */
const LEVEL_COLOR: Record<DeclLevel, string> = {
  national: 'volcano',
  provincial: 'blue',
  municipal: 'geekblue',
  college: 'default',
}

export default function PartyScoreRecords() {
  const t = useT()
  const [statusFilter, setStatusFilter] = useState<DeclStatus[]>([])
  const [levelFilter, setLevelFilter] = useState<DeclLevel[]>([])

  // 空数组表示「全部」；否则仅保留所选状态/等级的记录
  const data = useMemo(
    () =>
      MOCK_DECLARATIONS.filter(
        (record) =>
          (statusFilter.length === 0 || statusFilter.includes(record.status)) &&
          (levelFilter.length === 0 || levelFilter.includes(record.level)),
      ),
    [statusFilter, levelFilter],
  )

  const columns = useMemo<ColumnsType<MockDeclaration>>(
    () => [
      {
        title: t('partyDeclaration.colType'),
        dataIndex: 'typeKey',
        key: 'type',
        width: 140,
        render: (typeKey: string) => t(typeKey),
      },
      {
        title: t('partyDeclaration.colName'),
        dataIndex: 'nameKey',
        key: 'name',
        render: (nameKey: string) => t(nameKey),
      },
      {
        title: (
          <MultiSelectHeaderFilter
            title={t('partyDeclaration.colStatus')}
            allLabel={t('partyDeclaration.filterAll')}
            options={STATUS_KEYS.map((status) => ({
              value: status,
              label: t(`partyDeclaration.status_${status}`),
            }))}
            value={statusFilter}
            onChange={(next) => setStatusFilter(next as DeclStatus[])}
          />
        ),
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (status: DeclStatus) => (
          <Tag color={STATUS_COLOR[status]}>{t(`partyDeclaration.status_${status}`)}</Tag>
        ),
      },
      {
        title: (
          <MultiSelectHeaderFilter
            title={t('partyDeclaration.colLevel')}
            allLabel={t('partyDeclaration.filterAll')}
            options={LEVEL_KEYS.map((level) => ({
              value: level,
              label: t(`partyDeclaration.level_${level}`),
            }))}
            value={levelFilter}
            onChange={(next) => setLevelFilter(next as DeclLevel[])}
          />
        ),
        dataIndex: 'level',
        key: 'level',
        width: 140,
        render: (level: DeclLevel) => (
          <Tag color={LEVEL_COLOR[level]}>{t(`partyDeclaration.level_${level}`)}</Tag>
        ),
      },
      {
        title: t('partyDeclaration.colBonus'),
        dataIndex: 'bonus',
        key: 'bonus',
        width: 120,
        align: 'center',
        sorter: (a, b) => a.bonus - b.bonus,
        // 正数为加分（绿色），负数为减分（红色）
        render: (score: number) => (
          <span className={score < 0 ? 'party-score-minus' : 'party-score-plus'}>
            {score > 0 ? `+${score}` : score}
          </span>
        ),
      },
    ],
    [t, statusFilter, levelFilter],
  )

  return (
    <Table<MockDeclaration>
      rowKey="id"
      columns={columns}
      dataSource={data}
      pagination={false}
      scroll={{ x: 720 }}
    />
  )
}
