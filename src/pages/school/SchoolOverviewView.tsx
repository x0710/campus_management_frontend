/**
 * 党委学校端：总览（学校驾驶舱 → 全校党建驾驶舱 / 各二级党委排名）。
 *
 * 已接入真实接口：
 *   全校党员（人）  经 composables/usePortalOrg 定位当前用户所属「学校」组织（组织树根节点，深度 0）→
 *                   GET /api/organizations/{id}/members 取分页 total（只需总数，page_size=1）
 *
 * 平均分与各二级党委排名后端暂无对应接口，仍为模拟数据，故本页保留模拟数据提示。
 */
import { Alert } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { extractErrorReason } from '../../api/common'
import { queryOrgMembers } from '../../api/organizations'
import ErrorState from '../../components/ErrorState'
import { resolvePortalOrg } from '../../composables/usePortalOrg'
import { SCHOOL_ANCESTOR_DEPTHS } from '../../config/organization'
import { useT } from '../../i18n'

/** 全校党建平均分（模拟数据，后端暂无接口） */
const MOCK_AVG_SCORE = 80.2

/** 各二级党委排名（模拟数据，后端暂无接口）：tone 为 top 时红色，normal 时蓝色 */
const MOCK_RANKING: { id: string; name: string; score: number; tone: 'top' | 'normal' }[] = [
  { id: 'c1', name: '马克思主义学院', score: 88, tone: 'top' },
  { id: 'c2', name: '商学院', score: 85, tone: 'top' },
  { id: 'c3', name: '电信学院', score: 83, tone: 'normal' },
  { id: 'c4', name: '数理学院', score: 79, tone: 'normal' },
  { id: 'c5', name: '建工学院', score: 76, tone: 'normal' },
  { id: 'c6', name: '文学院', score: 72, tone: 'normal' },
]

export default function SchoolOverviewView() {
  const t = useT()

  /** 全校党员总数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      const { orgId } = await resolvePortalOrg(SCHOOL_ANCESTOR_DEPTHS)
      const memberPage = orgId === null ? null : await queryOrgMembers(orgId, { page: 1, page_size: 1 })
      setMembers(memberPage?.total ?? 0)
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
        <Alert type="warning" showIcon title={t('school.mockHint')} />
      )}

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('school.title')}</h3>
        </header>
        <div className="panel-card-body">
          {/* 全校党建驾驶舱 */}
          <h4 className="school-section-title">{t('school.cockpitTitle')}</h4>
          <div className="school-overview">
            <div className="school-overview-item">
              <span className="school-overview-label">{t('school.statMembers')}</span>
              <span className="school-overview-value">
                {statText(members)}
                <em className="school-overview-unit">{t('school.membersUnit')}</em>
              </span>
            </div>
            <div className="school-overview-item">
              <span className="school-overview-label">{t('school.statAvgScore')}</span>
              <span className="school-overview-value">{MOCK_AVG_SCORE}</span>
            </div>
          </div>

          {/* 各二级党委排名 */}
          <h4 className="school-section-title">{t('school.rankingTitle')}</h4>
          <div className="school-rank-list">
            {MOCK_RANKING.map((item, index) => (
              <div key={item.id} className="school-rank-row">
                <span className="school-rank-name">
                  {index + 1}. {item.name}
                </span>
                <div className="school-rank-track">
                  <div
                    className={`school-rank-bar school-rank-bar--${item.tone}`}
                    style={{ width: `${item.score}%` }}
                  />
                  <span className="school-rank-score">{item.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
