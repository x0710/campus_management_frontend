import { PlusOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button } from 'antd'
import PartyScoreRecords from '../../components/PartyScoreRecords'
import { useT } from '../../i18n'

/**
 * 党员端：成绩申报（我的申报）。
 * 注意：当前为【模拟数据预览页】，后端尚未提供申报相关接口。
 * 成绩记录表格与「我的-我的成绩记录」共用 PartyScoreRecords 组件。
 */
export default function PartyDeclarationView() {
  const t = useT()
  const { message } = AntdApp.useApp()

  return (
    <div className="party-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyDeclaration.title')}</h3>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => message.info(t('partyDeclaration.submitHint'))}
          >
            {t('partyDeclaration.submit')}
          </Button>
        </header>
        <div className="panel-card-body">
          <Alert
            type="warning"
            showIcon
            title={t('common.mockHint')}
            style={{ marginBottom: 16 }}
          />
          <PartyScoreRecords />
        </div>
      </section>
    </div>
  )
}
