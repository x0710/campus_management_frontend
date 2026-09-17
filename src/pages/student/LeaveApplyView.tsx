import { ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Select,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import axios from 'axios'
import { useMemo } from 'react'
import {
  checkLeaveConflict,
  createLeave,
  queryLeaves,
  type LeaveCreateRequest,
  type LeaveInfo,
  type LeaveType,
} from '../../api/leaves'
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

/** 学生端：请假申请表单 + 本人请假记录（POST /api/leaves，GET /api/leaves） */
export default function LeaveApplyView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm<LeaveFormValues>()
  const { data, total, loading, error, page, setPage, pageSize, setPageSize, refresh } =
    usePaginated<LeaveInfo>(queryLeaves)

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
      const conflict = await checkLeaveConflict({
        start_time: payload.start_time,
        end_time: payload.end_time,
      })
      if (conflict.has_conflict) {
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
    </div>
  )
}
