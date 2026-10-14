import { Alert } from 'antd'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import { useT } from '../../i18n'

/**
 * 党员端：首页（先锋指数概览）。
 * 注意：当前为【模拟数据预览页】，后端尚未提供党员端相关接口。
 * 「先锋指数 + 三项分数」与「我的-我的成绩记录」共用 PartyScoreSummary 组件。
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

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      {/* 顶部：姓名 + 所属支部 */}
      <section className="party-profile">
        <span className="party-member-name">{t('party.memberName')}</span>
        <span className="party-branch-name">{t('party.branchName')}</span>
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
