/**
 * 学生端：请假申请（表单 + 本人请假记录）。
 * - 填写完请假时间后自动调用 GET /api/leaves/check-conflict 做冲突预检并内联提示；
 * - 提交时再次预检（防时间被改动后状态过期），命中冲突直接拦截；
 * - 点击记录行打开请假详情弹窗（复用 LeaveDetailModal），在弹窗内可撤回 / 删除该申请。
 */
import { ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Popconfirm,
  Select,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import {
  cancelLeave,
  checkLeaveConflict,
  createLeave,
  deleteLeave,
  queryLeaves,
} from '../../api/leaves'
import type {
  LeaveConflict,
  LeaveCreateRequest,
  LeaveInfo,
  LeaveType,
} from '../../api/types/leaves'
import { extractErrorWithStatus } from '../../api/common'
import LeaveDetailModal from '../../components/LeaveDetailModal'
import { LEAVE_CONFLICT_CHECK_DEBOUNCE_MS } from '../../config/leave'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

const { RangePicker } = DatePicker
const { TextArea } = Input

const LEAVE_COLOR: Record<LeaveType, string> = {
  personal: 'blue',
  sick: 'orange',
  public: 'green',
  other: 'default',
}

interface LeaveFormValues {
  leave_type: LeaveType
  range: [Dayjs, Dayjs]
  destination: string
  reason: string
  parent_confirm: boolean
}

/** 详情弹窗内正在执行的操作（用于按钮 loading 与禁用） */
type DetailAction = 'cancel' | 'delete' | null

/** 学生端：请假申请表单 + 本人请假记录（POST /api/leaves，GET /api/leaves） */
export default function LeaveApplyView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm<LeaveFormValues>()
  const { data, total, loading, error, page, setPage, pageSize, setPageSize, refresh } =
    usePaginated<LeaveInfo>(queryLeaves)

  /** 点击记录行打开详情弹窗（携带请假记录 id） */
  const [detailId, setDetailId] = useState<number | null>(null)
  const [acting, setActing] = useState<DetailAction>(null)

  /** 时间填写后的冲突预检结果：null 表示尚未检查或时间不完整 */
  const [conflict, setConflict] = useState<LeaveConflict | null>(null)
  const [checking, setChecking] = useState(false)
  const [conflictError, setConflictError] = useState<string | null>(null)

  const typeOptions = useMemo(
    () =>
      (['personal', 'sick', 'public', 'other'] as LeaveType[]).map((v) => ({
        value: v,
        label: t(`leave.type_${v}`),
      })),
    [t],
  )

  const columns = useMemo<ColumnsType<LeaveInfo>>(
    () => [
      {
        title: t('leave.colId'),
        dataIndex: 'id',
        key: 'id',
        width: 110,
      },
      {
        title: t('leave.colType'),
        dataIndex: 'leave_type',
        key: 'leave_type',
        width: 120,
        render: (type: LeaveType) => (
          <Tag color={LEAVE_COLOR[type]}>{t(`leave.type_${type}`)}</Tag>
        ),
      },
      {
        title: t('leave.colStart'),
        dataIndex: 'start_time',
        key: 'start_time',
        width: 180,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('leave.colEnd'),
        dataIndex: 'end_time',
        key: 'end_time',
        width: 180,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('leave.colApproval'),
        dataIndex: 'approval_id',
        key: 'approval_id',
        width: 150,
      },
    ],
    [t, locale],
  )

  /** 统一错误提示：网络错误走文案，其余回显带状态码的后端信息（代码要求 9） */
  const showError = (err: unknown) => {
    const code = extractErrorWithStatus(err)
    message.error(code === 'network' ? t('common.networkError') : code)
  }

  // 监听请假时间：填写完整且合法后，防抖调用 check-conflict 做冲突预检
  const range = Form.useWatch('range', form)
  const startIso = range?.[0]?.toISOString() ?? ''
  const endIso = range?.[1]?.toISOString() ?? ''
  /** 时间是否已填写完整且开始早于结束（不满足时不展示预检结果） */
  const rangeValid = Boolean(startIso && endIso && startIso < endIso)

  useEffect(() => {
    if (!rangeValid) return
    let cancelled = false
    const timer = setTimeout(() => {
      setChecking(true)
      checkLeaveConflict({ start_time: startIso, end_time: endIso })
        .then((res) => {
          if (cancelled) return
          setConflict(res)
          setConflictError(null)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setConflict(null)
          setConflictError(extractErrorWithStatus(err))
        })
        .finally(() => {
          if (!cancelled) setChecking(false)
        })
    }, LEAVE_CONFLICT_CHECK_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [rangeValid, startIso, endIso])

  /** 冲突预检提示（含冲突记录的时间段，便于学生调整） */
  const conflictAlert = () => {
    if (!rangeValid) return null
    if (checking) {
      return <Alert type="info" showIcon title={t('leaveApply.conflictChecking')} />
    }
    if (conflictError) {
      return (
        <Alert
          type="error"
          showIcon
          title={t('leaveApply.conflictCheckFailed')}
          description={conflictError}
        />
      )
    }
    if (!conflict) return null
    if (!conflict.has_conflict) {
      return <Alert type="success" showIcon title={t('leaveApply.conflictNone')} />
    }
    return (
      <Alert
        type="warning"
        showIcon
        title={t('leaveApply.conflictFound', { count: conflict.conflicts.length })}
        description={
          <ul className="leave-conflict-list">
            {conflict.conflicts.map((item) => (
              <li key={item.id}>
                {t(`leave.type_${item.leave_type}`)}：{formatDateTime(item.start_time, locale)} ~{' '}
                {formatDateTime(item.end_time, locale)}
              </li>
            ))}
          </ul>
        }
      />
    )
  }

  /** 撤回请假申请：成功后关闭弹窗并刷新列表（代码要求 13） */
  const withdrawLeave = async (id: number) => {
    setActing('cancel')
    try {
      await cancelLeave(id)
      message.success(t('leaveApply.withdrawSuccess'))
      setDetailId(null)
      refresh()
    } catch (err) {
      showError(err)
    } finally {
      setActing(null)
    }
  }

  /** 删除请假记录：成功后关闭弹窗并刷新列表（代码要求 13） */
  const removeLeave = async (id: number) => {
    setActing('delete')
    try {
      await deleteLeave(id)
      message.success(t('leaveApply.deleteSuccess'))
      setDetailId(null)
      refresh()
    } catch (err) {
      showError(err)
    } finally {
      setActing(null)
    }
  }

  const onFinish = async (values: LeaveFormValues) => {
    const payload: LeaveCreateRequest = {
      leave_type: values.leave_type,
      reason: values.reason.trim(),
      start_time: values.range[0].toISOString(),
      end_time: values.range[1].toISOString(),
      destination: values.destination.trim(),
      // 附件上传接口尚未提供，按契约要求传空数组
      attachment_id: [],
      parent_confirm: Boolean(values.parent_confirm),
    }

    // 提交前做时间冲突预检，命中冲突直接拦截（后端创建时也会再校验一次）
    try {
      const precheck = await checkLeaveConflict({
        start_time: payload.start_time,
        end_time: payload.end_time,
      })
      if (precheck.has_conflict) {
        message.warning(t('leaveApply.conflictWarn'))
        return
      }
    } catch {
      // 预检接口异常不阻塞填写，交由创建接口做最终校验
    }

    try {
      await createLeave(payload)
      message.success(t('leaveApply.createSuccess'))
      form.resetFields()
      setPage(1)
      refresh()
    } catch (err) {
      // 后端错误响应为纯文本（如 400 冲突 / 403 无权限 / 404 数据不存在），原样展示
      const data = axios.isAxiosError(err) ? err.response?.data : null
      const detail = typeof data === 'string' && data.trim() ? data.trim() : null
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        message.error(detail || t('leaveApply.errConflictOrInvalid'))
      } else if (detail) {
        message.error(detail)
      } else if (axios.isAxiosError(err) && !err.response) {
        message.error(t('common.networkError'))
      } else {
        message.error(t('common.loadFailed'))
      }
    }
  }

  return (
    <div className="student-view">
      <section className="panel-card student-form-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('leaveApply.formTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <Form<LeaveFormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ leave_type: 'personal', parent_confirm: false }}
            onFinish={onFinish}
          >
            <div className="leave-form-grid">
              <Form.Item
                name="leave_type"
                label={t('leaveApply.fieldType')}
                rules={[{ required: true, message: t('leaveApply.typeRequired') }]}
              >
                <Select options={typeOptions} />
              </Form.Item>

              <Form.Item
                name="range"
                label={t('leaveApply.fieldRange')}
                rules={[{ required: true, message: t('leaveApply.rangeRequired') }]}
              >
                <RangePicker showTime style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                name="destination"
                label={t('leaveApply.fieldDestination')}
                rules={[{ required: true, message: t('leaveApply.destinationRequired') }]}
              >
                <Input maxLength={200} placeholder={t('leaveApply.destinationPlaceholder')} />
              </Form.Item>

              <Form.Item
                name="reason"
                label={t('leaveApply.fieldReason')}
                rules={[{ required: true, message: t('leaveApply.reasonRequired') }]}
              >
                <TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
            </div>

            {/* 时间填写后的冲突预检结果（代码要求 9：检查失败时展示状态码） */}
            <div className="leave-conflict-alert">{conflictAlert()}</div>

            <Form.Item name="parent_confirm" valuePropName="checked">
              <Checkbox>{t('leaveApply.parentConfirm')}</Checkbox>
            </Form.Item>

            <Form.Item className="leave-submit-item">
              <Button type="primary" htmlType="submit">
                {t('leaveApply.submit')}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </section>

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('leaveApply.myRecords')}</h3>
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            {t('common.refresh')}
          </Button>
        </header>
        <div className="panel-card-body">
          {error ? (
            <Alert
              type="error"
              showIcon
              title={error === 'network' ? t('common.networkError') : t('common.loadFailed')}
              action={
                <Button size="small" onClick={refresh}>
                  {t('common.retry')}
                </Button>
              }
            />
          ) : (
            <Table<LeaveInfo>
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={data}
              scroll={{ x: 760 }}
              onRow={(record) => ({
                onClick: () => setDetailId(record.id),
                title: t('leaveApply.rowClickHint'),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showTotal: (n: number) => `${t('common.total')} ${n} ${t('common.items')}`,
                onChange: (nextPage: number, nextSize: number) => {
                  if (nextSize !== pageSize) setPageSize(nextSize)
                  else setPage(nextPage)
                },
              }}
            />
          )}
        </div>
      </section>

      {/* 请假详情：点击记录行打开，底部提供「撤回 / 删除」操作 */}
      <LeaveDetailModal
        open={detailId !== null}
        leaveId={detailId}
        onClose={() => setDetailId(null)}
        footerExtra={
          detailId !== null ? (
            <>
              <Popconfirm
                title={t('leaveApply.withdrawConfirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                okButtonProps={{ loading: acting === 'cancel' }}
                onConfirm={() => void withdrawLeave(detailId)}
              >
                <Tooltip title={t('leaveApply.withdrawHint')}>
                  <Button size="small" disabled={acting === 'delete'}>
                    {t('leaveApply.withdraw')}
                  </Button>
                </Tooltip>
              </Popconfirm>
              <Popconfirm
                title={t('leaveApply.deleteConfirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true, loading: acting === 'delete' }}
                onConfirm={() => void removeLeave(detailId)}
              >
                <Tooltip title={t('leaveApply.deleteHint')}>
                  <Button size="small" danger disabled={acting === 'cancel'}>
                    {t('leaveApply.delete')}
                  </Button>
                </Tooltip>
              </Popconfirm>
            </>
          ) : null
        }
      />
    </div>
  )
}
