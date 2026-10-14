import { DownOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Dropdown, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import MultiSelectHeaderFilter from '../../components/MultiSelectHeaderFilter'
import { useT } from '../../i18n'

/**
 * 党员支部端：党员概览（本支部全部党员）。
 * 表头：编号 | 姓名 | 组织 | 成绩（可正序/倒序） | 等级（可单选/多选筛选） | 操作（详细：档案/成绩，编辑）。
 * 注意：当前为【模拟数据预览页】，后端暂无接口；接口就绪后替换 MOCK_MEMBERS 即可。
 */

/** 党员等级 */
type MemberGrade = 'pioneer' | 'demonstration' | 'progress' | 'warning'

interface MockMember {
  id: string
  /** 编号 */
  no: string
  /** 姓名 */
  name: string
  /** 组织（所属支部） */
  org: string
  /** 成绩 */
  score: number
  grade: MemberGrade
}

/** 所属支部名称（本支部全部党员） */
const BRANCH_NAME = '机关第一党支部'

/** 党员列表（模拟数据） */
const MOCK_MEMBERS: MockMember[] = [
  { id: 'm1', no: '2023010001', name: '张伟', org: BRANCH_NAME, score: 92.5, grade: 'pioneer' },
  { id: 'm2', no: '2023010002', name: '李娜', org: BRANCH_NAME, score: 88, grade: 'demonstration' },
  { id: 'm3', no: '2023010003', name: '王强', org: BRANCH_NAME, score: 85.5, grade: 'demonstration' },
  { id: 'm4', no: '2022010007', name: '刘敏', org: BRANCH_NAME, score: 81, grade: 'progress' },
  { id: 'm5', no: '2022010012', name: '陈杰', org: BRANCH_NAME, score: 78.5, grade: 'progress' },
  { id: 'm6', no: '2021010023', name: '赵芳', org: BRANCH_NAME, score: 74, grade: 'progress' },
  { id: 'm7', no: '2021010031', name: '孙磊', org: BRANCH_NAME, score: 68, grade: 'warning' },
  { id: 'm8', no: '2020010045', name: '周涛', org: BRANCH_NAME, score: 61.5, grade: 'warning' },
]

/** 等级可选项（用于表头单选/多选筛选） */
const GRADE_KEYS: MemberGrade[] = ['pioneer', 'demonstration', 'progress', 'warning']

/** 等级标签配色 */
const GRADE_COLOR: Record<MemberGrade, string> = {
  pioneer: 'red',
  demonstration: 'gold',
  progress: 'blue',
  warning: 'default',
}

export default function BranchMembersView() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const [gradeFilter, setGradeFilter] = useState<MemberGrade[]>([])

  // 空数组表示「全部」；否则仅保留所选等级的党员
  const data = useMemo(
    () => MOCK_MEMBERS.filter((member) => gradeFilter.length === 0 || gradeFilter.includes(member.grade)),
    [gradeFilter],
  )

  const columns = useMemo<ColumnsType<MockMember>>(
    () => [
      { title: t('branchMember.colNo'), dataIndex: 'no', key: 'no', width: 140 },
      { title: t('branchMember.colName'), dataIndex: 'name', key: 'name', width: 120 },
      { title: t('branchMember.colOrg'), dataIndex: 'org', key: 'org' },
      {
        title: t('branchMember.colScore'),
        dataIndex: 'score',
        key: 'score',
        width: 120,
        align: 'center',
        sorter: (a, b) => a.score - b.score,
        render: (score: number) => <span className="branch-member-score">{score}</span>,
      },
      {
        title: (
          <MultiSelectHeaderFilter
            title={t('branchMember.colGrade')}
            allLabel={t('branchMember.filterAll')}
            options={GRADE_KEYS.map((grade) => ({
              value: grade,
              label: t(`branch.grade_${grade}`),
            }))}
            value={gradeFilter}
            onChange={(next) => setGradeFilter(next as MemberGrade[])}
          />
        ),
        dataIndex: 'grade',
        key: 'grade',
        width: 140,
        render: (grade: MemberGrade) => (
          <Tag color={GRADE_COLOR[grade]}>{t(`branch.grade_${grade}`)}</Tag>
        ),
      },
      {
        title: t('branchMember.colAction'),
        key: 'action',
        width: 180,
        render: () => (
          <div className="branch-member-actions">
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'archive', label: t('branchMember.detailArchive') },
                  { key: 'score', label: t('branchMember.detailScore') },
                ],
                onClick: ({ key }) =>
                  message.info(
                    key === 'archive'
                      ? t('branchMember.archiveHint')
                      : t('branchMember.scoreHint'),
                  ),
              }}
            >
              <Button type="link" size="small">
                {t('branchMember.detail')}
                <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              type="link"
              size="small"
              onClick={() => message.info(t('branchMember.editHint'))}
            >
              {t('branchMember.edit')}
            </Button>
          </div>
        ),
      },
    ],
    [t, gradeFilter, message],
  )

  return (
    <div className="party-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('portal.branch_m2')}</h3>
        </header>
        <div className="panel-card-body">
          <Alert
            type="warning"
            showIcon
            title={t('common.mockHint')}
            style={{ marginBottom: 16 }}
          />
          <Table<MockMember>
            rowKey="id"
            columns={columns}
            dataSource={data}
            pagination={false}
            scroll={{ x: 900 }}
          />
        </div>
      </section>
    </div>
  )
}
