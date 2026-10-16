import { RightOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Empty } from 'antd'
import { useState } from 'react'
import { useT } from '../../i18n'

/**
 * 党委支部端：审核管理（支部审核中心 → 加分申报初审）。
 * 注意：当前为【模拟数据预览页】，后端暂无接口；
 * 接口就绪后把 MOCK_ITEMS 替换为 src/api/ 请求，并把 handleReview 改为真实的审核接口调用。
 */

interface MockReviewItem {
  id: string
  /** 申报人 */
  name: string
  /** 申报事项 */
  item: string
  /** 分值（正数为加分，负数为减分） */
  points: number
}

/** 待审核的加分申报（模拟数据） */
const MOCK_ITEMS: MockReviewItem[] = [
  { id: 'v1', name: '李同学', item: '学科竞赛省级二等奖', points: 4 },
  { id: 'v2', name: '王老师', item: '指导大创项目', points: 2 },
  { id: 'v3', name: '赵同学', item: '志愿服务时长20h', points: 1 },
]

export default function BranchReviewView() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const [items, setItems] = useState<MockReviewItem[]>(MOCK_ITEMS)

  /** 审核（通过 / 退回）：从待审核列表移除并提示（模拟） */
  const handleReview = (record: MockReviewItem, approve: boolean) => {
    setItems((prev) => prev.filter((item) => item.id !== record.id))
    const hint = t(approve ? 'branchReview.approveHint' : 'branchReview.rejectHint', {
      name: record.name,
    })
    if (approve) {
      message.success(hint)
    } else {
      message.warning(hint)
    }
  }

  return (
    <div className="party-view">
      <Alert type="warning" showIcon title={t('common.mockHint')} />

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('branchReview.title')}</h3>
        </header>
        <div className="panel-card-body">
          <h4 className="review-section-title">{t('branchReview.sectionTitle')}</h4>

          {items.length === 0 ? (
            <Empty description={t('branchReview.empty')} />
          ) : (
            <div className="review-list">
              {items.map((record) => (
                <article key={record.id} className="review-card">
                  <div className="review-card-main">
                    <div className="review-card-info">
                      <div className="review-card-name">{record.name}</div>
                      <div className="review-card-item">{record.item}</div>
                      <div
                        className={
                          record.points < 0
                            ? 'review-card-points review-card-points--deduct'
                            : 'review-card-points'
                        }
                      >
                        {record.points > 0 ? `+${record.points}` : record.points}
                        {t('party.scoreUnit')}
                      </div>
                    </div>
                    <Button
                      type="link"
                      size="small"
                      className="review-card-evidence"
                      onClick={() => message.info(t('branchReview.evidenceHint'))}
                    >
                      {t('branchReview.evidence')}
                      <RightOutlined />
                    </Button>
                  </div>
                  <div className="review-card-actions">
                    <Button
                      className="review-btn review-btn-reject"
                      onClick={() => handleReview(record, false)}
                    >
                      {t('branchReview.reject')}
                    </Button>
                    <Button
                      className="review-btn review-btn-approve"
                      onClick={() => handleReview(record, true)}
                    >
                      {t('branchReview.approve')}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
