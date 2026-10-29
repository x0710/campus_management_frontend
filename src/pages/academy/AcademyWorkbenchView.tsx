/**
 * 党委学院端：工作台（学院先锋指数总览 / 各支部排名 / 待党委认定）。
 *
 * 已接入真实接口：
 *   全院党员（人）  经 composables/usePortalOrg 定位当前用户所属「学院」组织（组织树深度 1）→
 *                   GET /api/organizations/{id}/member-counts?recursive=true
 *                   按组织统计成员数（含全部下级组织，前端相加得总数）
 *
 * 平均分、各支部排名与待党委认定后端暂无对应接口，仍为模拟数据，故本页保留模拟数据提示。
 */
import { RightOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { extractErrorReason } from '../../api/common'
import ErrorState from '../../components/ErrorState'
import { countOrgMemberTotal } from '../../composables/useOrgMemberTotal'
import { resolvePortalOrg } from '../../composables/usePortalOrg'
import { ACADEMY_ANCESTOR_DEPTHS } from '../../config/organization'
import { useT } from '../../i18n'

/** 各支部排名（模拟数据，后端暂无接口）：tone 为 high 时蓝色，low 时橙色 */
const MOCK_RANKING: { id: string; name: string; score: number; tone: 'high' | 'low' }[] = [
  { id: 'r1', name: '行政支部', score: 88.6, tone: 'high' },
  { id: 'r2', name: '教师一支部', score: 82.1, tone: 'high' },
  { id: 'r3', name: '学生一支部', score: 78.3, tone: 'low' },
  { id: 'r4', name: '学生二支部', score: 72.5, tone: 'low' },
]

/** 学院先锋指数平均分（模拟数据，后端暂无接口） */
const MOCK_AVG_SCORE = 79.6
/** 待党委认定的加分条数（模拟数据，后端暂无接口） */
const MOCK_PENDING_COUNT = 12

export default function AcademyWorkbenchView() {
  const t = useT()
  const { message } = AntdApp.useApp()

  /** 本院党员总数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      const { orgId } = await resolvePortalOrg(ACADEMY_ANCESTOR_DEPTHS)
      setMembers(orgId === null ? 0 : await countOrgMemberTotal(orgId))
    } catch (err) {
      // 401 由 http 拦截器统一处理登录态，此处不重复提示
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  /** 重新加载（事件回调内可安全重置加载态） */
  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    void load()
  }, [load])

  /** 加载中显示占位符，避免先闪出 0 再跳变为真实值 */
  const statText = (value: number | null) => (loading ? '—' : String(value ?? 0))

  return (
    <div className="party-view">
      {error ? (
        <ErrorState
          message={error}
          onRetry={retry}
        />
      ) : (
        <Alert type="warning" showIcon title={t('academy.mockHint')} />
      )}

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('academy.title')}</h3>
        </header>
        <div className="panel-card-body">
          {/* 学院先锋指数总览 */}
          <h4 className="academy-section-title">{t('academy.overviewTitle')}</h4>
          <div className="academy-overview">
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('academy.statMembers')}</span>
              <span className="academy-overview-value">
                {statText(members)}
                <em className="academy-overview-unit">{t('academy.membersUnit')}</em>
              </span>
            </div>
            <div className="academy-overview-item">
              <span className="academy-overview-label">{t('academy.statAvgScore')}</span>
              <span className="academy-overview-value">{MOCK_AVG_SCORE}</span>
            </div>
          </div>

          {/* 各支部排名 */}
          <h4 className="academy-section-title">{t('academy.rankingTitle')}</h4>
          <div className="academy-rank-list">
            {MOCK_RANKING.map((branch, index) => (
              <div key={branch.id} className="academy-rank-row">
                <span className="academy-rank-name">
                  {index + 1}. {branch.name}
                </span>
                <div className="academy-rank-track">
                  <div
                    className={`academy-rank-bar academy-rank-bar--${branch.tone}`}
                    style={{ width: `${branch.score}%` }}
                  />
                  <span className="academy-rank-score">{branch.score}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 待党委认定 */}
          <h4 className="academy-section-title">{t('academy.pendingTitle')}</h4>
          <button
            type="button"
            className="academy-pending"
            onClick={() => message.info(t('academy.pendingHint'))}
          >
            <span className="academy-pending-text">
              {t('academy.pendingItem', { count: MOCK_PENDING_COUNT })}
            </span>
            <RightOutlined className="academy-pending-icon" />
          </button>
        </div>
      </section>
    </div>
  )
}
