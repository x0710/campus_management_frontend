/**
 * 导出范围选择弹窗：选择「仅当前组织」或「包含下级组织」。
 * 支部端 / 二级党委端 / 学校党委端共用，保证三端导出交互一致。
 */
import { Modal, Radio, Space, Typography } from 'antd'
import { useState } from 'react'
import { useT } from '../i18n'

export interface ExportScopeModalProps {
  /** 是否打开弹窗（必填） */
  open: boolean
  /** 是否正在导出（可选，默认 false；导出期间禁止关闭） */
  loading?: boolean
  /** 当前组织是否存在下级组织（必填；false 时禁用「包含下级组织」） */
  hasChildren: boolean
  /** 取消（必填） */
  onCancel: () => void
  /** 确认导出（必填；参数为是否包含下级组织） */
  onExport: (includeChildren: boolean) => void
}

export default function ExportScopeModal({
  open,
  loading = false,
  hasChildren,
  onCancel,
  onExport,
}: ExportScopeModalProps) {
  const t = useT()
  // 每次都从「仅当前组织」开始，避免上次选择被无提示沿用
  const [includeChildren, setIncludeChildren] = useState(false)

  const handleCancel = () => {
    if (loading) return
    setIncludeChildren(false)
    onCancel()
  }

  return (
    <Modal
      open={open}
      title={t('branchExport.scopeTitle')}
      okText={t('branchExport.exportOk')}
      cancelText={t('common.cancel')}
      confirmLoading={loading}
      onOk={() => onExport(includeChildren)}
      onCancel={handleCancel}
      closable={!loading}
      mask={{ closable: !loading }}
      destroyOnHidden
      afterClose={() => setIncludeChildren(false)}
    >
      <Space direction="vertical" size={12}>
        <Typography.Text type="secondary">{t('branchExport.scopeDesc')}</Typography.Text>
        <Radio.Group
          value={includeChildren}
          onChange={(event) => setIncludeChildren(event.target.value)}
          disabled={loading}
        >
          <Space direction="vertical">
            <Radio value={false}>{t('branchExport.scopeDirect')}</Radio>
            <Radio value={true} disabled={!hasChildren}>
              {t('branchExport.scopeWithChildren')}
            </Radio>
          </Space>
        </Radio.Group>
        {!hasChildren && (
          <Typography.Text type="secondary">{t('branchExport.scopeNoChildren')}</Typography.Text>
        )}
      </Space>
    </Modal>
  )
}
