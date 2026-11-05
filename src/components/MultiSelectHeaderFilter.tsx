/** 表头多选筛选下拉（「全部」与多个选项可同时勾选）。 */

import { FilterOutlined } from '@ant-design/icons'
import { Dropdown } from 'antd'

/**
 * 表头多选筛选（通用）：点击表头弹出「全部 + 各选项」复选菜单。
 * 不勾选任何具体项即视为「全部」；可同时勾选多个选项（如同时选「待审核」与「已通过」）。
 * @param props 类型：{ 表头文案 title: string 「全部」选项文案 allLabel: string options: { value: string; label: string }[] 已选值；空数组表示「全部」 value: string[] onChange: (next: string[]) => void }；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function MultiSelectHeaderFilter({
  title,
  allLabel,
  options,
  value,
  onChange,
  onOpenChange,
}: {
  /** 表头文案 */
  title: string
  /** 「全部」选项文案 */
  allLabel: string
  options: { value: string; label: string }[]
  /** 已选值；空数组表示「全部」 */
  value: string[]
  onOpenChange?: (open: boolean) => void
  onChange: (next: string[]) => void
}) {
  return (
    <Dropdown
      trigger={['click']}
      onOpenChange={onOpenChange}
      menu={{
        items: [
          { key: '__all__', label: allLabel },
          ...options.map((option) => ({ key: option.value, label: option.label })),
        ],
        selectable: true,
        multiple: true,
        selectedKeys: value.length === 0 ? ['__all__'] : value,
        onClick: ({ key }) => {
          if (key === '__all__') {
            onChange([])
            return
          }
          onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key])
        },
      }}
    >
      <span className="table-filter-trigger">
        {title}
        <FilterOutlined className="table-filter-icon" />
      </span>
    </Dropdown>
  )
}
