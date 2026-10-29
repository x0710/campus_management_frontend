/**
 * 党委学校端：总览（学校驾驶舱 → 全校党建驾驶舱 / 各二级党委排名）。
 *
 * 已接入真实接口：
 *   全校党员（人）  固定以「学院党委」容器（ID=2）为起点 →
 *                   GET /api/organizations/{id}/member-counts?recursive=true
 *                   按组织统计成员数（含全部下级组织，前端相加得总数）
 *   平均分          GET /api/party/scores/organization-average?organization_id=2&recursive=true
 *   各二级党委排名   GET /api/organizations/{id}/subsidiaries 获取「学院党委」容器（ID=2）下的
 *                   各二级学院党委，再逐个调用 GET /api/party/scores/organization-average
 *                   （recursive=true）后按平均分排序
 *
 */
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractErrorReason } from '../../api/common'
import { listSubsidiaries } from '../../api/organizations'
import { getPartyScoreOrganizationAverage } from '../../api/partyScores'
import ErrorState from '../../components/ErrorState'
import { countOrgMemberTotal } from '../../composables/useOrgMemberTotal'
import { SCHOOL_COLLEGE_PARENT_ORG_ID } from '../../config/organization'
import { useT } from '../../i18n'
import { formatPartyScoreTotal, toPartyScoreTotal } from '../../utils/partyScore'

interface CommitteeRankingItem {
  id: number
  name: string
  score: number | null
}

export default function SchoolOverviewView() {
  const t = useT()

  /** 全校党员总数（人）；null 表示未取到（加载中或加载失败） */
  const [members, setMembers] = useState<number | null>(null)
  /** 全校党建活动加分平均分（后端为字符串；null 表示无数据或加载失败） */
  const [averageScore, setAverageScore] = useState<string | null>(null)
  /** 各二级党委排名（按平均分从高到低） */
  const [committeeRankings, setCommitteeRankings] = useState<CommitteeRankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 注意：load 内不得在首个 await 之前 setState，否则会触发 react(set-state-in-effect) 告警
  const load = useCallback(async () => {
    try {
      const [memberTotal, average, subsidiaries] = await Promise.all([
        countOrgMemberTotal(SCHOOL_COLLEGE_PARENT_ORG_ID),
        getPartyScoreOrganizationAverage({
          organization_id: SCHOOL_COLLEGE_PARENT_ORG_ID,
          recursive: true,
        }),
        listSubsidiaries(SCHOOL_COLLEGE_PARENT_ORG_ID),
      ])
      const committeeAverages = await Promise.all(
        subsidiaries.map((committee) =>
          getPartyScoreOrganizationAverage({
            organization_id: committee.id,
            recursive: true,
          }),
        ),
      )
      const rankedCommittees = subsidiaries
        .map((committee, index) => ({
          id: committee.id,
          name: committee.name,
          score: toPartyScoreTotal(committeeAverages[index].average_score),
        }))
        .sort(
          (a, b) =>
            (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY),
        )
      setMembers(memberTotal)
      setAverageScore(average.average_score)
      setCommitteeRankings(rankedCommittees)
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
  const averageText = loading ? '—' : formatPartyScoreTotal(averageScore)
  const maxCommitteeScore = useMemo(
    () => Math.max(0, ...committeeRankings.map((item) => item.score ?? 0)),
    [committeeRankings],
  )

  return (
    <div className="party-view">
      {error && (
        <ErrorState
          message={error}
          onRetry={retry}
        />
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
              <span className="school-overview-value">{averageText}</span>
            </div>
          </div>

          {/* 各二级党委排名 */}
          <h4 className="school-section-title">{t('school.rankingTitle')}</h4>
          <div className="school-rank-list">
            {committeeRankings.map((item, index) => {
              const score = item.score ?? 0
              const barWidth =
                maxCommitteeScore > 0 && item.score !== null
                  ? `${Math.max(0, score / maxCommitteeScore) * 100}%`
                  : '0%'
              return (
                <div key={item.id} className="school-rank-row">
                  <span className="school-rank-name">
                    {index + 1}. {item.name}
                  </span>
                  <div className="school-rank-track">
                    <div
                      className={`school-rank-bar school-rank-bar--${index < 2 ? 'top' : 'normal'}`}
                      style={{ width: barWidth }}
                    />
                    <span className="school-rank-score">{item.score ?? '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
