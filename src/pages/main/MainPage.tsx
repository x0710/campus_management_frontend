import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Tag } from 'antd'
import { useNavigate } from 'react-router'
import PortalHeader from '../../components/PortalHeader'
import { PORTALS, type PortalDef } from '../../config/portals'
import { useT } from '../../i18n'
import { useAuthStore } from '../../store/auth'

/** 主页：四个工作端（学生 / 老师 / 领导 / 管理）的门户选择 */
export default function MainPage() {
  const t = useT()
  const navigate = useNavigate()
  const username = useAuthStore((s) => s.username)

  return (
    <div className="portal-page">
      <PortalHeader />

      <main className="portal-main">
        <section className="portal-hero">
          <h1>{t('main.welcomeBack', { name: username ?? '' })}</h1>
          <p>{t('main.welcomeDesc')}</p>
        </section>

        <section className="portal-grid">
          {PORTALS.map((portal) => (
            <PortalCard
              key={portal.key}
              portal={portal}
              onEnter={() => navigate(`/portal/${portal.key}`)}
            />
          ))}
        </section>
      </main>
    </div>
  )
}

function PortalCard({ portal, onEnter }: { portal: PortalDef; onEnter: () => void }) {
  const t = useT()
  const name = t(`portal.${portal.key}_name`)

  return (
    <article
      className="portal-card"
      style={{ ['--portal-accent' as string]: portal.accent }}
    >
      <div className="portal-card-banner" style={{ background: portal.gradient }}>
        <span className="portal-card-icon">{portal.icon}</span>
        <Tag className="portal-card-tag" variant="filled">
          {t('portal.pendingTag')}
        </Tag>
      </div>

      <div className="portal-card-body">
        <h3 className="portal-card-name">{name}</h3>
        <p className="portal-card-desc">{t(`portal.${portal.key}_desc`)}</p>

        <div className="portal-card-modules">
          <div className="portal-card-modules-title">{t('portal.plannedTitle')}</div>
          <ul>
            {portal.modules.map((m) => (
              <li key={m.key}>
                <span>{t(`portal.${m.key}`)}</span>
                {m.status === 'ready' && (
                  <Tag className="module-status-tag" color="green" variant="filled">
                    {t('portal.tagReady')}
                  </Tag>
                )}
                {m.status === 'preview' && (
                  <Tag className="module-status-tag" color="blue" variant="filled">
                    {t('portal.tagPreview')}
                  </Tag>
                )}
                {m.status === 'pending-api' && (
                  <Tag className="module-status-tag" color="orange" variant="filled">
                    {t('portal.tagApiPending')}
                  </Tag>
                )}
              </li>
            ))}
          </ul>
        </div>

        <Button
          type="primary"
          block
          className="portal-card-enter"
          style={{ background: portal.accent, borderColor: portal.accent }}
          onClick={onEnter}
        >
          {t('portal.enter')}
          <ArrowRightOutlined />
        </Button>
      </div>
    </article>
  )
}
