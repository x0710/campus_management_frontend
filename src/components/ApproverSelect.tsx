import { Alert, Button, Select, Space, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { extractErrorReason } from '../api/common'
import { queryUsers } from '../api/users'
import { useT } from '../i18n'

/** 指定审批人使用用户工号（uid），提交接口要求的字符串。 */
export default function ApproverSelect({ id, value, onChange }: {
  /** Form.Item 注入的字段 id，需透传给 Select，否则 label 的 for 会指向不存在的元素 */
  id?: string
  value?: string
  onChange?: (value: string | undefined) => void
}) {
  const t = useT()
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const labels = useRef(new Map<string, string>())

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        // 自动读完接口分页，下拉框直接对完整列表按姓名或工号筛选。
        const collected = new Map<string, { value: string; label: string }>()
        let page = 1
        let totalPages = 1
        do {
          const result = await queryUsers({ page, page_size: 100 }, retry > 0)
          if (cancelled) return
          for (const user of result.data) {
            const id = String(user.uid)
            collected.set(id, {
              value: id,
              label: user.name?.trim() ? `${user.name.trim()}（${id}）` : id,
            })
          }
          totalPages = result.total_pages
          page += 1
        } while (page <= totalPages)
        const next = [...collected.values()]
        next.forEach((option) => labels.current.set(option.value, option.label))
        setOptions(next)
      } catch (err) {
        if (!cancelled) setError(extractErrorReason(err, t))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [retry, t])

  return <Select
    id={id}
    value={value}
    onChange={onChange}
    allowClear
    showSearch
    optionFilterProp="label"
    loading={loading}
    options={options}
    labelRender={({ value: selected, label }) => labels.current.get(String(selected)) ?? label ?? String(selected)}
    placeholder={t('approvalTemplate.fieldStepAssigneePlaceholder')}
    popupRender={(menu) => <>
      {menu}
      <Space orientation="vertical" style={{ width: '100%', padding: 8 }}>
        {error && <Alert type="error" showIcon title={error} action={
          <Button size="small" onClick={() => setRetry((previous) => previous + 1)}>{t('common.retry')}</Button>
        } />}
        {loading && <Spin size="small" />}
      </Space>
    </>}
  />
}
