/**
 * 组织成员搜索「查看方式」切换（可复用组件，代码要求 1）。
 *
 * 姓名搜索命中多人后可切换匹配人员的查看方式：
 *   - 在组织里面查看匹配人员（默认）：定位到命中人员所在组织，并在成员表内高亮其行；
 *   - 单独查看匹配人员：成员区只展示匹配出来的人员，不随组织切换。
 * 按钮文案随当前模式互换（小程序式单按钮切换），悬停提示说明点击后的效果（代码要求 10）；
 * 无匹配人员时不展示，避免占用表头空间。
 */
import { ApartmentOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useT } from '../i18n'

interface MemberSearchModeToggleProps {
  /** 当前是否为「单独查看匹配人员」模式（必填） */
  matchOnly: boolean
  /** 是否展示（必填；无匹配人员时传 false） */
  visible: boolean
  /** 切换查看方式（必填） */
  onToggle: () => void
}

export default function MemberSearchModeToggle({
  matchOnly,
  visible,
  onToggle,
}: MemberSearchModeToggleProps) {
  const t = useT()

  if (!visible) return null

  const label = matchOnly
    ? t('orgExplorer.modeBackToOrg')
    : t('orgExplorer.modeMatchOnly')
  const hint = matchOnly
    ? t('orgExplorer.modeBackToOrgHint')
    : t('orgExplorer.modeMatchOnlyHint')

  return (
    <Tooltip title={hint}>
      <Button
        type="link"
        size="small"
        className="member-search-mode-toggle"
        icon={matchOnly ? <ApartmentOutlined /> : <TeamOutlined />}
        onClick={() => onToggle()}
      >
        {label}
      </Button>
    </Tooltip>
  )
}
