/**
 * 领导端：校历管理（校历日历 + 事件增删改）。
 * 复用 useCalendarEvents + CalendarBoard，在其上叠加管理能力：
 * - 工具栏「新增事件」→ POST /api/calendars（权限 calendar.create）；
 * - 右侧卡片中每个事件详情的「编辑」→ PATCH /api/calendars/{id}（权限 calendar.update）；
 * - 右侧卡片中每个事件详情的「删除」→ DELETE /api/calendars/{id}（权限 calendar.delete，删除前二次确认）；
 * - 每次保存/删除后失效日历缓存并强制刷新看板与当日详情（ai 要求 13）。
 */
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Tooltip,
} from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import {
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
  type CalendarEventDetail,
  type EventType,
} from '../../api/calendars'
import { extractError } from '../../api/common'
import CalendarBoard from '../../components/CalendarBoard'
import { useCalendarEvents } from '../../composables/useCalendarEvents'
import { CALENDAR_EVENT_TYPES } from '../../config/calendar'
import { useT } from '../../i18n'

const { RangePicker } = DatePicker

/** 表单值：日期区间为 [开始, 结束] */
interface EventFormValues {
  title: string
  event_type: EventType
  range: [Dayjs, Dayjs]
  description?: string
}

/** 表单弹窗状态：新增（带默认选中日期）/ 编辑（带事件详情） */
type FormModal =
  | { mode: 'create'; defaultDate: Dayjs }
  | { mode: 'edit'; event: CalendarEventDetail }
  | null

export default function CalendarManageView() {
  const t = useT()
  const { message } = AntdApp.useApp()
  const {
    value,
    setValue,
    typeFilter,
    setTypeFilter,
    eventsByDay,
    loading,
    error,
    reload,
    dayDetails,
    dayDetailsLoading,
    dayDetailsError,
  } = useCalendarEvents()

  const [formModal, setFormModal] = useState<FormModal>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form] = Form.useForm<EventFormValues>()

  /** 统一错误提示：网络错误走文案，其余回显后端状态码/信息（ai 要求 9） */
  const showError = useCallback(
    (err: unknown) => {
      const code = typeof err === 'string' ? err : extractError(err)
      message.error(
        code === 'network'
          ? t('common.networkError')
          : code === 'failed'
            ? t('common.loadFailed')
            : code,
      )
    },
    [message, t],
  )

  // 详情拉取失败（如 404）弹窗提示状态码
  useEffect(() => {
    if (dayDetailsError) showError(dayDetailsError)
  }, [dayDetailsError, showError])

  /** 打开新增弹窗：起止日期默认取当前选中日期（默认值，非业务数据） */
  const openCreate = () => {
    setFormModal({ mode: 'create', defaultDate: value.startOf('day') })
  }

  /** 打开编辑弹窗：按事件 id 重新拉取最新详情（绕过缓存）后回填表单 */
  const openEdit = async (event: CalendarEventDetail) => {
    try {
      const full = await getEvent(event.id, true)
      setFormModal({ mode: 'edit', event: full })
    } catch (err) {
      showError(err)
    }
  }

  // 弹窗打开后回填表单初始值（新增用默认日期，编辑用事件详情）
  useEffect(() => {
    if (!formModal) return
    if (formModal.mode === 'create') {
      const day = formModal.defaultDate
      form.setFieldsValue({
        title: '',
        event_type: 'activity',
        range: [day, day],
        description: '',
      })
      return
    }
    const { event } = formModal
    form.setFieldsValue({
      title: event.title,
      event_type: event.event_type,
      range: [dayjs(event.start_date).startOf('day'), dayjs(event.end_date).startOf('day')],
      description: event.description ?? '',
    })
  }, [formModal, form])

  /** 提交表单：新增或更新事件，成功后强制刷新看板（ai 要求 13） */
  const submitForm = async () => {
    const values = await form.validateFields()
    const [start, end] = values.range
    const payload = {
      start_date: start.startOf('day').toISOString(),
      end_date: end.startOf('day').toISOString(),
      title: values.title.trim(),
      event_type: values.event_type,
      description: values.description?.trim() || null,
    }
    setSaving(true)
    try {
      if (formModal?.mode === 'edit') {
        await updateEvent(formModal.event.id, payload)
        message.success(t('calendar.updateSuccess'))
      } else {
        await createEvent(payload)
        message.success(t('calendar.createSuccess'))
      }
      setFormModal(null)
      await reload(true)
    } catch (err) {
      showError(err)
    } finally {
      setSaving(false)
    }
  }

  /** 删除指定事件：成功后强制刷新列表与当日详情（ai 要求 13） */
  const removeEvent = async (id: number) => {
    setDeletingId(id)
    try {
      await deleteEvent(id)
      message.success(t('calendar.deleteSuccess'))
      await reload(true)
    } catch (err) {
      showError(err)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <CalendarBoard
        title={t('calendar.manageTitle')}
        value={value}
        onValueChange={setValue}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        eventsByDay={eventsByDay}
        dayDetails={dayDetails}
        dayDetailsLoading={dayDetailsLoading}
        loading={loading}
        error={error}
        onRefresh={reload}
        toolbarExtra={
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
          >
            {t('calendar.createEvent')}
          </Button>
        }
        renderEventActions={(event) => (
          <>
            <Tooltip title={t('calendar.editEvent')}>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => void openEdit(event)}
              />
            </Tooltip>
            <Popconfirm
              title={t('calendar.deleteConfirm')}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true, loading: deletingId === event.id }}
              onConfirm={() => void removeEvent(event.id)}
            >
              <Tooltip title={t('calendar.deleteEvent')}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </>
        )}
      />

      <Modal
        open={formModal !== null}
        title={
          formModal?.mode === 'edit' ? t('calendar.editEvent') : t('calendar.createEvent')
        }
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        onOk={() => void submitForm()}
        onCancel={() => setFormModal(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label={t('calendar.fieldTitle')}
            rules={[{ required: true, message: t('calendar.titleRequired') }]}
          >
            <Input maxLength={100} placeholder={t('calendar.fieldTitle')} />
          </Form.Item>
          <Form.Item
            name="event_type"
            label={t('calendar.fieldType')}
            rules={[{ required: true, message: t('calendar.typeRequired') }]}
          >
            <Select
              options={CALENDAR_EVENT_TYPES.map((type) => ({
                value: type,
                label: t(`calendar.type_${type}`),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="range"
            label={t('calendar.fieldDateRange')}
            rules={[{ required: true, message: t('calendar.rangeRequired') }]}
          >
            <RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="description" label={t('calendar.fieldDescription')}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}