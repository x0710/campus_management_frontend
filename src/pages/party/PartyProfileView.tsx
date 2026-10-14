import { BellOutlined } from '@ant-design/icons'
import { Alert, Descriptions, Empty, Tabs } from 'antd'
import PartyScoreRecords from '../../components/PartyScoreRecords'
import PartyScoreSummary from '../../components/PartyScoreSummary'
import { useT } from '../../i18n'

/**
 * 党员端：我的（我的成绩记录 / 年度评价报告 / 消息通知 / 操作指南 / 关于井大大先锋）。
 * 注意：当前为【模拟数据预览页】，后端尚未提供党员端相关接口。
 * 我的成绩记录：复用总成绩概览（PartyScoreSummary）与成绩记录表格（PartyScoreRecords）。
 */

/** 消息通知（模拟数据；字段对应 i18n 文案 key） */
const MOCK_NOTIFICATIONS: { id: string; titleKey: string; timeKey: string; bodyKey: string }[] = [
  {
    id: 'n1',
    titleKey: 'partyProfile.notif_1_title',
    timeKey: 'partyProfile.notif_1_time',
    bodyKey: 'partyProfile.notif_1_body',
  },
  {
    id: 'n2',
    titleKey: 'partyProfile.notif_2_title',
    timeKey: 'partyProfile.notif_2_time',
    bodyKey: 'partyProfile.notif_2_body',
  },
  {
    id: 'n3',
    titleKey: 'partyProfile.notif_3_title',
    timeKey: 'partyProfile.notif_3_time',
    bodyKey: 'partyProfile.notif_3_body',
  },
]

/** 我的档案：基本信息 */
function ProfileDescriptions() {
  const t = useT()
  const items = [
    { key: 'name', label: t('partyProfile.fieldName'), children: t('party.memberName') },
    { key: 'phone', label: t('partyProfile.fieldPhone'), children: t('partyProfile.valuePhone') },
    { key: 'gender', label: t('partyProfile.fieldGender'), children: t('partyProfile.valueGender') },
    {
      key: 'memberNo',
      label: t('partyProfile.fieldMemberNo'),
      children: t('partyProfile.valueMemberNo'),
    },
    { key: 'branch', label: t('partyProfile.fieldBranch'), children: t('party.branchName') },
    {
      key: 'political',
      label: t('partyProfile.fieldPoliticalStatus'),
      children: t('partyProfile.valuePoliticalStatus'),
    },
    {
      key: 'joinDate',
      label: t('partyProfile.fieldJoinDate'),
      children: t('partyProfile.valueJoinDate'),
    },
    { key: 'email', label: t('partyProfile.fieldEmail'), children: t('partyProfile.valueEmail') },
  ]
  return <Descriptions column={2} items={items} />
}

/** 占位内容（年度评价报告 / 操作指南 / 关于井大大先锋 暂不实现） */
function Placeholder() {
  const t = useT()
  return (
    <div className="party-placeholder">
      <Empty description={t('partyProfile.emptyHint')} />
    </div>
  )
}

/** 消息通知列表 */
function NotificationsList() {
  const t = useT()
  return (
    <ul className="party-notif-list">
      {MOCK_NOTIFICATIONS.map((item) => (
        <li key={item.id} className="party-notif-item">
          <div className="party-notif-head">
            <span className="party-notif-title">
              <BellOutlined className="party-notif-icon" />
              {t(item.titleKey)}
            </span>
            <span className="party-notif-time">{t(item.timeKey)}</span>
          </div>
          <div className="party-notif-body">{t(item.bodyKey)}</div>
        </li>
      ))}
    </ul>
  )
}

export default function PartyProfileView() {
  const t = useT()

  const items = [
    { key: 'profile', label: t('partyProfile.tabProfile'), children: <ProfileDescriptions /> },
    {
      key: 'scores',
      label: t('partyProfile.tabScores'),
      children: (
        <div className="party-tab-body">
          <PartyScoreSummary />
          <PartyScoreRecords />
        </div>
      ),
    },
    { key: 'report', label: t('partyProfile.tabReport'), children: <Placeholder /> },
    { key: 'notifications', label: t('partyProfile.tabNotifications'), children: <NotificationsList /> },
    { key: 'guide', label: t('partyProfile.tabGuide'), children: <Placeholder /> },
    { key: 'about', label: t('partyProfile.tabAbout'), children: <Placeholder /> },
  ]

  return (
    <div className="party-view">
      <section className="panel-card">
        <div className="panel-card-body">
          <Alert
            type="warning"
            showIcon
            title={t('common.mockHint')}
            style={{ marginBottom: 16 }}
          />
          <Tabs items={items} />
        </div>
      </section>
    </div>
  )
}
