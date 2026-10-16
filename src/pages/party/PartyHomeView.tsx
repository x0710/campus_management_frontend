import { Alert } from 'antd'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import { useCurrentIdentity } from '../../composables/useCurrentIdentity'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'

/**
 * 党员端：首页（先锋指数概览）。
 * 顶部「姓名 + 所属组织」：经 useCurrentIdentity 取当前登录用户的真实姓名与任职组织，
 * 姓名取不到时回退账户名，组织无任职时回退占位符（不使用业务数据做默认填充）。
 * 注意：「先锋指数 + 三项分数」与「我的成绩记录」为【模拟数据预览】，后端尚未提供党员端相关接口，
 * 与 PartyProfileView 共用 PartyScoreSummary 组件。
 */

/** 近期记录（模拟数据；actKey 对应 i18n 文案） */
interface MockRecord {
  id: string
  /** 记录日期（月.日） */
  date: string
  actKey: string
  /** 加减分，正数为加分 */
  delta: number
}

const MOCK_RECORDS: MockRecord[] = [
  { id: 'r1', date: '9.28', actKey: 'party.rec_thesis', delta: 2 },
  { id: 'r2', date: '9.20', actKey: 'party.rec_teachers_day', delta: 3 },
  { id: 'r3', date: '9.10', actKey: 'party.rec_volunteer', delta: 1.5 },
]

export default function PartyHomeView() {
  const t = useT()
  const username = useAuthStore((s) => s.username)
  const { name, organizations } = useCurrentIdentity()

  // 姓名：真实姓名优先，取不到时回退账户名，最后回退占位符
  const displayName = name?.trim() || username || t('common.unknown')
  // 所属组织：取第一项任职组织名称，无任职时回退占位符
  const displayOrg = organizations[0] || t('common.unknown')

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      {/* 顶部：姓名 + 所属支部 */}
      <section className="party-profile">
        <span className="party-member-name">{displayName}</span>
        <span className="party-branch-name">{displayOrg}</span>
      </section>

      {/* 总成绩：先锋指数 + 基础分/加分项/减分 */}
      <PartyScoreSummary />

      {/* 近期记录 */}
      <section className="party-records">
        <h3 className="party-records-title">{t('party.recentRecords')}</h3>
        <ul className="party-records-list">
          {MOCK_RECORDS.map((record) => (
            <li key={record.id} className="party-record-item">
              <span className="party-record-date">{record.date}</span>
              <span className="party-record-act">{t(record.actKey)}</span>
              <span className="party-record-delta">
                {record.delta > 0 ? `+${record.delta}` : record.delta}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
