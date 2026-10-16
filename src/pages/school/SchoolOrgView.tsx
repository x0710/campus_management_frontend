import { Alert, Empty, Table, Tag, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import { useT } from '../../i18n'

/**
 * 党委学校端：组织管理（组织树 + 选中组织的成员信息）。
 * 注意：当前为【模拟数据预览页】，后端暂无接口；接口就绪后替换 MOCK_ORGS / MOCK_MEMBERS 即可。
 */

/** 党员等级 */
type MemberGrade = 'pioneer' | 'demonstration' | 'progress' | 'warning'

/** 等级标签配色（与支部端党员概览保持一致） */
const GRADE_COLOR: Record<MemberGrade, string> = {
  pioneer: 'red',
  demonstration: 'gold',
  progress: 'blue',
  warning: 'default',
}

interface MockOrg {
  id: string
  name: string
  children?: MockOrg[]
}

/** 组织树节点（antd Tree 使用） */
interface OrgTreeNode {
  key: string
  title: string
  children?: OrgTreeNode[]
}

interface MockOrgMember {
  id: string
  /** 党员编号（学号/工号） */
  uid: string
  name: string
  /** 所属组织 id（仅挂在叶子组织上，选中上级组织时自动汇总下级） */
  orgId: string
  /** 所属组织名称 */
  orgName: string
  /** 党内职务 */
  position: string
  score: number
  grade: MemberGrade
}

/** 组织结构（模拟数据） */
const MOCK_ORGS: MockOrg[] = [
  {
    id: 'o-school',
    name: '校党委',
    children: [
      {
        id: 'o-org',
        name: '机关党委',
        children: [
          { id: 'o-org-admin', name: '行政支部' },
          { id: 'o-org-academic', name: '教务支部' },
        ],
      },
      {
        id: 'o-marx',
        name: '马克思主义学院党委',
        children: [
          { id: 'o-marx-t', name: '教师一支部' },
          { id: 'o-marx-s', name: '学生一支部' },
        ],
      },
      {
        id: 'o-biz',
        name: '商学院党委',
        children: [
          { id: 'o-biz-t', name: '教师二支部' },
          { id: 'o-biz-s', name: '学生二支部' },
        ],
      },
      {
        id: 'o-tele',
        name: '电信学院党委',
        children: [{ id: 'o-tele-t', name: '电信教工支部' }],
      },
    ],
  },
]

/** 组织成员（模拟数据） */
const MOCK_MEMBERS: MockOrgMember[] = [
  { id: 'm1', uid: '2020010001', name: '张建国', orgId: 'o-org-admin', orgName: '行政支部', position: '支部书记', score: 88.5, grade: 'pioneer' },
  { id: 'm2', uid: '2019010026', name: '李明', orgId: 'o-org-admin', orgName: '行政支部', position: '组织委员', score: 84, grade: 'demonstration' },
  { id: 'm3', uid: '2018010033', name: '王芳', orgId: 'o-org-academic', orgName: '教务支部', position: '支部书记', score: 82.5, grade: 'demonstration' },
  { id: 'm4', uid: '2020010048', name: '赵磊', orgId: 'o-org-academic', orgName: '教务支部', position: '普通党员', score: 76, grade: 'progress' },
  { id: 'm5', uid: '2017010015', name: '陈静', orgId: 'o-marx-t', orgName: '教师一支部', position: '支部书记', score: 91, grade: 'pioneer' },
  { id: 'm6', uid: '2019010062', name: '刘洋', orgId: 'o-marx-t', orgName: '教师一支部', position: '宣传委员', score: 80.5, grade: 'demonstration' },
  { id: 'm7', uid: '2023010107', name: '周敏', orgId: 'o-marx-s', orgName: '学生一支部', position: '支部书记', score: 79, grade: 'progress' },
  { id: 'm8', uid: '2022010119', name: '吴昊', orgId: 'o-marx-s', orgName: '学生一支部', position: '普通党员', score: 68.5, grade: 'warning' },
  { id: 'm9', uid: '2018010071', name: '孙丽', orgId: 'o-biz-t', orgName: '教师二支部', position: '支部书记', score: 86.5, grade: 'pioneer' },
  { id: 'm10', uid: '2020010524', name: '郑强', orgId: 'o-biz-t', orgName: '教师二支部', position: '组织委员', score: 77.5, grade: 'progress' },
  { id: 'm11', uid: '2023010132', name: '冯鑫', orgId: 'o-biz-s', orgName: '学生二支部', position: '支部书记', score: 74, grade: 'progress' },
  { id: 'm12', uid: '2022010145', name: '何雪', orgId: 'o-biz-s', orgName: '学生二支部', position: '普通党员', score: 66, grade: 'warning' },
  { id: 'm13', uid: '2019010088', name: '马涛', orgId: 'o-tele-t', orgName: '电信教工支部', position: '支部书记', score: 83, grade: 'demonstration' },
  { id: 'm14', uid: '2020010653', name: '徐婷', orgId: 'o-tele-t', orgName: '电信教工支部', position: '普通党员', score: 71.5, grade: 'progress' },
]

/** 递归收集某组织及其全部下级组织的 id */
function collectOrgIds(org: MockOrg): string[] {
  return [org.id, ...(org.children ?? []).flatMap(collectOrgIds)]
}

/** 在组织树中按 id 查找组织 */
function findOrg(orgs: MockOrg[], id: string): MockOrg | undefined {
  for (const org of orgs) {
    if (org.id === id) return org
    const found = org.children ? findOrg(org.children, id) : undefined
    if (found) return found
  }
  return undefined
}

export default function SchoolOrgView() {
  const t = useT()
  const [selectedId, setSelectedId] = useState(MOCK_ORGS[0].id)

  /** 组织树数据 */
  const treeData = useMemo(() => {
    const toNode = (org: MockOrg): OrgTreeNode => ({
      key: org.id,
      title: org.name,
      children: org.children?.map(toNode),
    })
    return MOCK_ORGS.map(toNode)
  }, [])

  /** 当前选中组织的成员（含其下级组织） */
  const members = useMemo(() => {
    const selected = findOrg(MOCK_ORGS, selectedId)
    if (!selected) return []
    const ids = new Set(collectOrgIds(selected))
    return MOCK_MEMBERS.filter((member) => ids.has(member.orgId))
  }, [selectedId])

  const columns: ColumnsType<MockOrgMember> = [
    { title: t('schoolOrg.colUid'), dataIndex: 'uid', key: 'uid' },
    { title: t('schoolOrg.colName'), dataIndex: 'name', key: 'name' },
    { title: t('schoolOrg.colOrg'), dataIndex: 'orgName', key: 'orgName' },
    { title: t('schoolOrg.colPosition'), dataIndex: 'position', key: 'position' },
    {
      title: t('schoolOrg.colScore'),
      dataIndex: 'score',
      key: 'score',
      sorter: (a, b) => a.score - b.score,
    },
    {
      title: t('schoolOrg.colGrade'),
      dataIndex: 'grade',
      key: 'grade',
      render: (grade: MemberGrade) => (
        <Tag color={GRADE_COLOR[grade]}>{t(`branch.grade_${grade}`)}</Tag>
      ),
    },
  ]

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      <div className="admin-org-view">
        <section className="panel-card org-tree-card">
          <header className="panel-card-header">
            <h3 className="panel-card-title">{t('schoolOrg.treeTitle')}</h3>
          </header>
          <div className="panel-card-body">
            <Tree
              treeData={treeData}
              defaultExpandAll
              selectedKeys={[selectedId]}
              onSelect={(keys) => {
                if (keys.length > 0) setSelectedId(String(keys[0]))
              }}
            />
          </div>
        </section>

        <section className="panel-card org-members-card">
          <header className="panel-card-header">
            <h3 className="panel-card-title">
              {t('schoolOrg.membersTitleCount', { count: members.length })}
            </h3>
          </header>
          <div className="panel-card-body">
            <Table
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={members}
              pagination={false}
              locale={{ emptyText: <Empty description={t('schoolOrg.emptyMembers')} /> }}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
