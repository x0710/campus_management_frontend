/**
 * 角色数据范围配置弹窗（可复用组件）：为指定角色配置「资源 → 数据范围」映射。
 * - 打开时按 role.id 拉取 GET /api/rbac/roles/{role_id}/data-scopes 回填已有配置；
 * - 支持增删资源维度配置行，每行选择数据范围（all / self_only / org / org_and_child / custom），
 *   当范围为 custom 时必须填写逗号分隔的组织 ID 白名单；
 * - 保存调用 PUT /api/rbac/roles/{role_id}/data-scopes 覆盖式写入（清空旧配置后批量写入），
 *   成功后回调 onSaved 由调用方刷新（代码要求 13）。
 * 数据范围选项与长度限制集中在 config/rbac.ts，文案走 i18n（adminRoles.*）。
 */
import { DeleteOutlined, PlusOutlined, SafetyOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Input, Modal, Select, Table, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useRef, useState } from 'react'
import { assignRoleDataScopes, getRoleDataScopes } from '../api/rbac'
import type { DataScope, RoleInfo } from '../api/types/rbac'
import { extractErrorReason } from '../api/common'
import {
  DATA_SCOPE_OPTIONS,
  RBAC_DATA_SCOPE_MAX_ROWS,
  RBAC_DATA_SCOPE_RESOURCE_MAX_LENGTH,
  RBAC_DATA_SCOPE_VALUE_MAX_LENGTH,
} from '../config/rbac'
import { useT } from '../i18n'

/** 弹窗内可编辑的数据范围行 */
interface ScopeRow {
  /** 行唯一键（仅前端使用） */
  key: number
  /** 资源标识 */
  resource: string
  /** 数据范围 */
  scope: DataScope
  /** 自定义组织 ID 白名单（仅 scope='custom' 时有效） */
  scopeValue: string
}

interface RoleDataScopeModalProps {
  /** 是否打开（必填） */
  open: boolean
  /** 目标角色（必填；为 null 时不展示内容） */
  role: RoleInfo | null
  /** 取消/关闭时触发（必填） */
  onCancel: () => void
  /** 保存成功后触发，用于刷新数据（必填） */
  onSaved: () => void
}

export default function RoleDataScopeModal({
  open,
  role,
  onCancel,
  onSaved,
}: RoleDataScopeModalProps) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const [rows, setRows] = useState<ScopeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // 行 key 自增计数（避免用业务数据作 key，代码要求 8）
  const keySeq = useRef(0)

  /** 统一错误提示：带 HTTP 状态码与中文原因（代码要求 9） */
  const showError = useCallback(
    (err: unknown) => {
      message.error(extractErrorReason(err, t))
    },
    [message, t],
  )

  const roleId = role?.id ?? null

  /** 拉取角色已有数据范围配置（成功回填，失败提示但不关闭弹窗） */
  const loadData = useCallback(async () => {
    if (!open || roleId == null) return
    setLoading(true)
    setRows([])
    try {
      const list = await getRoleDataScopes(roleId)
      keySeq.current = 0
      setRows(
        list.map((item) => ({
          key: keySeq.current++,
          resource: item.resource,
          scope: item.scope,
          scopeValue: item.scope_value ?? '',
        })),
      )
    } catch (err) {
      showError(err)
    } finally {
      setLoading(false)
    }
  }, [open, roleId, showError])

  // 打开时按角色拉取已有数据范围配置
  useEffect(() => {
    void loadData()
  }, [loadData])

  /** 更新单行字段 */
  const updateRow = (key: number, patch: Partial<Omit<ScopeRow, 'key'>>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  /** 追加一行默认空配置 */
  const addRow = () => {
    if (rows.length >= RBAC_DATA_SCOPE_MAX_ROWS) {
      message.warning(t('adminRoles.dsMaxRows'))
      return
    }
    setRows((prev) => [
      ...prev,
      { key: keySeq.current++, resource: '', scope: 'all', scopeValue: '' },
    ])
  }

  /** 删除一行 */
  const removeRow = (key: number) => {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  /** 数据范围下拉选项（label 为文案，desc 为悬停提示，代码要求 10） */
  const scopeOptions = DATA_SCOPE_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
    desc: t(o.descKey),
  }))

  /** 保存：校验后覆盖式提交 */
  const submit = async () => {
    if (!role) return
    for (const row of rows) {
      if (!row.resource.trim()) {
        message.error(t('adminRoles.dsResourceRequired'))
        return
      }
      if (row.scope === 'custom' && !row.scopeValue.trim()) {
        message.error(t('adminRoles.dsCustomRequired'))
        return
      }
    }
    setSaving(true)
    try {
      await assignRoleDataScopes(
        role.id,
        rows.map((row) => ({
          resource: row.resource.trim(),
          scope: row.scope,
          scope_value: row.scope === 'custom' ? row.scopeValue.trim() : null,
        })),
      )
      message.success(t('adminRoles.dsSaveSuccess'))
      onSaved()
      onCancel()
    } catch (err) {
      showError(err)
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<ScopeRow> = [
    {
      title: t('adminRoles.dsResource'),
      dataIndex: 'resource',
      key: 'resource',
      width: 200,
      render: (_: unknown, row: ScopeRow) => (
        <Input
          value={row.resource}
          maxLength={RBAC_DATA_SCOPE_RESOURCE_MAX_LENGTH}
          placeholder={t('adminRoles.dsResourcePlaceholder')}
          onChange={(e) => updateRow(row.key, { resource: e.target.value })}
        />
      ),
    },
    {
      title: t('adminRoles.dsScope'),
      dataIndex: 'scope',
      key: 'scope',
      width: 200,
      render: (_: unknown, row: ScopeRow) => (
        <Select<DataScope>
          value={row.scope}
          style={{ width: '100%' }}
          options={scopeOptions}
          onChange={(v) =>
            updateRow(row.key, {
              scope: v,
              // 非 custom 时清空组织 ID，避免提交无效值
              scopeValue: v === 'custom' ? row.scopeValue : '',
            })
          }
          optionRender={(option) => (
            <Tooltip title={option.data.desc} placement="right">
              <span>{option.label}</span>
            </Tooltip>
          )}
        />
      ),
    },
    {
      title: (
        <Tooltip title={t('adminRoles.dsScopeValueHint')}>
          <span>{t('adminRoles.dsScopeValue')}</span>
        </Tooltip>
      ),
      dataIndex: 'scopeValue',
      key: 'scopeValue',
      render: (_: unknown, row: ScopeRow) => (
        <Input
          value={row.scopeValue}
          disabled={row.scope !== 'custom'}
          maxLength={RBAC_DATA_SCOPE_VALUE_MAX_LENGTH}
          placeholder={t('adminRoles.dsScopeValuePlaceholder')}
          onChange={(e) => updateRow(row.key, { scopeValue: e.target.value })}
        />
      ),
    },
    {
      title: t('approval.colAction'),
      key: 'action',
      width: 80,
      render: (_: unknown, row: ScopeRow) => (
        <Button
          type="link"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeRow(row.key)}
        >
          {t('adminRoles.delete')}
        </Button>
      ),
    },
  ]

  return (
    <Modal
      open={open}
      title={
        role
          ? `${t('adminRoles.dataScopeTitle')}：${role.name}（${role.code}）`
          : t('adminRoles.dataScopeTitle')
      }
      width={860}
      okText={t('adminRoles.save')}
      cancelText={t('approval.cancel')}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => void submit()}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        icon={<SafetyOutlined />}
        title={t('adminRoles.dataScopeHint')}
        style={{ marginBottom: 12 }}
      />
      <div className="approval-toolbar" style={{ marginBottom: 12 }}>
        <Button icon={<PlusOutlined />} onClick={addRow}>
          {t('adminRoles.dsAddRow')}
        </Button>
      </div>
      <Table<ScopeRow>
        rowKey="key"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: t('adminRoles.dsNoRows') }}
        pagination={false}
        scroll={{ y: 360 }}
      />
    </Modal>
  )
}