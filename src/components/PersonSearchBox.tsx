/**
 * 通用「人员搜索框」（可复用组件，代码要求 1）。
 *
 * 统一各页面「输入学号或姓名查询某人」的搜索框外观与交互：
 * 搜索图标前缀、可一键清空、回车 / 搜索按钮触发、搜索中加载态。
 *
 * 本组件只负责输入与交互呈现：学号（纯数字）与姓名的判定（见 utils/personSearch）
 * 以及命中后的处理由宿主实现——组织架构按人员定位并跳转，用户与账户按学号或姓名筛选列表，
 * 从而在不同页面复用同一套搜索框（代码要求 2：可扩展）。
 */
import { SearchOutlined } from '@ant-design/icons'
import { Input } from 'antd'
import type { ChangeEvent } from 'react'
import { useT } from '../i18n'

interface PersonSearchBoxProps {
  /** 输入框当前值（必填，受控） */
  value: string
  /** 输入变化回调（必填；清空时入参为空串，宿主可据此重置筛选） */
  onChange: (value: string) => void
  /** 触发搜索回调（必填；回车 / 点击搜索按钮 / 清空时调用，入参为输入框当前值） */
  onSearch: (value: string) => void
  /** 是否正在搜索（可选，默认 false，用于展示加载态） */
  loading?: boolean
  /** 占位提示（可选，默认复用「输入学号或姓名搜索成员」） */
  placeholder?: string
  /** 输入框宽度（可选；不传则不设内联宽度，交由外层 CSS / 父容器决定） */
  width?: number
  /** 尺寸（可选，默认 'middle'） */
  size?: 'small' | 'middle' | 'large'
  /** 是否展示搜索按钮（可选，默认 true） */
  showEnterButton?: boolean
  /** 外层样式类名（可选） */
  className?: string
}

/**
 * 人员搜索框：按学号或姓名查询某人。
 * @param props 见 PersonSearchBoxProps（value / onChange / onSearch 必填）
 * @returns 统一的「学号 / 姓名」搜索输入框
 */
export default function PersonSearchBox({
  value,
  onChange,
  onSearch,
  loading = false,
  placeholder,
  width,
  size = 'middle',
  showEnterButton = true,
  className,
}: PersonSearchBoxProps) {
  const t = useT()
  return (
    <Input.Search
      allowClear
      className={className}
      style={width ? { width } : undefined}
      size={size}
      enterButton={showEnterButton ? t('common.search') : undefined}
      prefix={<SearchOutlined />}
      placeholder={placeholder ?? t('orgExplorer.searchMemberPlaceholder')}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      onSearch={(v: string) => onSearch(v)}
      loading={loading}
    />
  )
}
