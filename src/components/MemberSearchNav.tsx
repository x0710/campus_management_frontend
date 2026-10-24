/**
 * 组织成员姓名搜索结果条（可复用组件，代码要求 1）。
 *
 * 姓名模糊匹配后紧邻搜索框展示「共匹配 N 人 · 第 X 人」与上一个 / 下一个按钮：
 * 不使用弹窗，避免遮挡成员表，定位命中成员的同时仍可查看当前组织的其他人员。
 * 数据与操作均由 useMemberSearch 提供。
 */
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useT } from '../i18n'

interface MemberSearchNavProps {
  /** 是否展示（必填；姓名搜索且命中总数大于 1 时为 true） */
  visible: boolean
  /** 后端匹配总数（必填） */
  total: number
  /** 当前定位到的第几个（必填，从 0 开始） */
  index: number
  /** 是否正在定位 / 加载候选页（必填；期间禁用按钮） */
  loading: boolean
  /** 是否可定位上一个（必填） */
  canPrev: boolean
  /** 是否可定位下一个（必填） */
  canNext: boolean
  /** 定位上一个（必填） */
  onPrev: () => void
  /** 定位下一个（必填） */
  onNext: () => void
}

/**
 * 姓名模糊搜索的多命中结果条（内联，不遮挡成员表）。
 * @param props 见 MemberSearchNavProps
 * @returns 匹配总数 + 上一个 / 下一个按钮；未开启时渲染 null
 */
export default function MemberSearchNav({
  visible,
  total,
  index,
  loading,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: MemberSearchNavProps) {
  const t = useT()
  if (!visible) return null
  return (
    <div className="member-search-nav">
      <span className="member-search-nav-count">
        {t('orgExplorer.searchResultCount', { total, current: index + 1 })}
      </span>
      <Tooltip title={t('orgExplorer.searchResultPrev')}>
        <Button
          size="small"
          icon={<LeftOutlined />}
          aria-label={t('orgExplorer.searchResultPrev')}
          disabled={loading || !canPrev}
          onClick={onPrev}
        />
      </Tooltip>
      <Tooltip title={t('orgExplorer.searchResultNext')}>
        <Button
          size="small"
          icon={<RightOutlined />}
          aria-label={t('orgExplorer.searchResultNext')}
          disabled={loading || !canNext}
          onClick={onNext}
        />
      </Tooltip>
    </div>
  )
}
