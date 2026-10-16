/**
 * 党员端：成绩申报（申报表单 + 我的申报记录）。
 *
 * 说明：后端尚未提供申报接口，当前【临时】借用请假接口承载申报数据：
 *   POST   /api/leaves               提交申报
 *   GET    /api/leaves               我的申报记录（后端按当前用户过滤，会话缓存）
 *   GET    /api/leaves/{id}          申报详情（复用 LeaveDetailModal）
 *   PATCH  /api/leaves/{id}/cancel   撤回申报
 *   DELETE /api/leaves/{id}          删除申报记录
 *   POST   /api/files                佐证材料上传（返回的文件 id 写入 attachment_id）
 * 申报类型与请假类型的临时映射、上传限制见 config/partyDeclaration.ts。
 * 按 代码要求 4，接口变更说明只写在注释里，不进入页面文案。
 * 「目的地」「家长确认」按需求不展示（申报场景无此概念，提交时按接口契约传默认值）。
 */
import { ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import {
  Alert,
  App as AntdApp,
  Button,
  DatePicker,
  Form,
  Input,
  Popconfirm,
  Select,
  Table,
  Tag,
  Tooltip,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { extractErrorWithStatus } from '../../api/common'
import { uploadFiles } from '../../api/file'
import { cancelLeave, createLeave, deleteLeave, queryLeaves } from '../../api/leaves'
import type { UploadedFileResponse } from '../../api/types/file'
import type { LeaveCreateRequest, LeaveInfo, LeaveType } from '../../api/types/leaves'
import LeaveDetailModal from '../../components/LeaveDetailModal'
import { LEAVE_TYPE_COLOR } from '../../config/leave'
import {
  DECLARATION_DEFAULT_TYPE,
  DECLARATION_EVIDENCE_MAX_COUNT,
  DECLARATION_EVIDENCE_MAX_SIZE_MB,
  DECLARATION_TYPES,
} from '../../config/partyDeclaration'
import { usePaginated } from '../../hooks/usePaginated'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

const { RangePicker } = DatePicker
const { TextArea } = Input

interface DeclarationFormValues {
  decl_type: LeaveType
  range: [Dayjs, Dayjs]
  reason: string
}

/** 详情弹窗内正在执行的操作（用于按钮 loading 与禁用） */
type DetailAction = 'cancel' | 'delete' | null

/** 党员端：成绩申报（表单 + 本人申报记录） */
export default function PartyDeclarationView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm<DeclarationFormValues>()
  const { data, total, loading, error, page, setPage, pageSize, setPageSize, refresh } =
    usePaginated<LeaveInfo>(queryLeaves)

  /** 点击记录行打开详情弹窗（携带申报记录 id） */
  const [detailId, setDetailId] = useState<number | null>(null)
  const [acting, setActing] = useState<DetailAction>(null)
  const [evidences, setEvidences] = useState<UploadProps['fileList']>([])
  const [submitting, setSubmitting] = useState(false)

  const typeOptions = useMemo(
    () =>
      DECLARATION_TYPES.map((value) => ({
        value,
        label: t(`partyDeclaration.type_${value}`),
      })),
    [t],
  )

  const columns = useMemo<ColumnsType<LeaveInfo>>(
    () => [
      {
        title: t('partyDeclaration.colId'),
        dataIndex: 'id',
        key: 'id',
        width: 110,
      },
      {
        title: t('partyDeclaration.colDeclType'),
        dataIndex: 'leave_type',
        key: 'leave_type',
        width: 140,
        render: (type: LeaveType) => (
          <Tag color={LEAVE_TYPE_COLOR[type]}>{t(`partyDeclaration.type_${type}`)}</Tag>
        ),
      },
      {
        title: t('partyDeclaration.colStart'),
        dataIndex: 'start_time',
        key: 'start_time',
        width: 180,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('partyDeclaration.colEnd'),
        dataIndex: 'end_time',
        key: 'end_time',
        width: 180,
        render: (v: string) => formatDateTime(v, locale),
      },
      {
        title: t('partyDeclaration.colApproval'),
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

  /** 佐证材料上传：走 POST /api/files，成功后把返回的文件 id 在提交时写入 attachment_id */
  const uploadEvidence: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options
    try {
      const [uploaded] = await uploadFiles([file as File])
      onSuccess?.(uploaded)
    } catch (err) {
      onError?.(err as Error)
      showError(err)
    }
  }

  /** 上传前校验体积：超限直接忽略该文件（不加入列表、不发起请求） */
  const beforeUploadEvidence: UploadProps['beforeUpload'] = (file) => {
    if (file.size > DECLARATION_EVIDENCE_MAX_SIZE_MB * 1024 * 1024) {
      message.error(
        t('partyDeclaration.evidenceTooLarge', { size: DECLARATION_EVIDENCE_MAX_SIZE_MB }),
      )
      return Upload.LIST_IGNORE
    }
    return true
  }

  /** 撤回申报：成功后关闭弹窗并刷新列表（代码要求 13） */
  const withdrawDeclaration = async (id: number) => {
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

  /** 删除申报记录：成功后关闭弹窗并刷新列表（代码要求 13） */
  const removeDeclaration = async (id: number) => {
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

  const onFinish = async (values: DeclarationFormValues) => {
    // 汇总已上传成功的佐证材料 id（上传失败/进行中的文件其 response 为空，自动跳过）
    const attachmentIds = (evidences ?? [])
      .map((item) => (item.response as UploadedFileResponse | undefined)?.id)
      .filter((id): id is number => typeof id === 'number')

    const payload: LeaveCreateRequest = {
      leave_type: values.decl_type,
      reason: values.reason.trim(),
      start_time: values.range[0].toISOString(),
      end_time: values.range[1].toISOString(),
      // 隐藏字段按接口契约提交默认值
      destination: '',
      attachment_id: attachmentIds.map(String),
      parent_confirm: false,
    }

    setSubmitting(true)
    try {
      await createLeave(payload)
      message.success(t('partyDeclaration.createSuccess'))
      form.resetFields()
      setEvidences([])
      setPage(1)
      refresh()
    } catch (err) {
      showError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="party-view">
      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyDeclaration.formTitle')}</h3>
        </header>
        <div className="panel-card-body">
          <Form<DeclarationFormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ decl_type: DECLARATION_DEFAULT_TYPE }}
            onFinish={onFinish}
          >
            <div className="leave-form-grid">
              <Form.Item
                name="decl_type"
                label={t('partyDeclaration.fieldType')}
                rules={[{ required: true, message: t('partyDeclaration.typeRequired') }]}
              >
                <Select options={typeOptions} />
              </Form.Item>

              <Form.Item
                name="range"
                label={t('partyDeclaration.fieldRange')}
                rules={[{ required: true, message: t('partyDeclaration.rangeRequired') }]}
              >
                <RangePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <Form.Item
              name="reason"
              label={t('partyDeclaration.fieldReason')}
              rules={[{ required: true, message: t('partyDeclaration.reasonRequired') }]}
            >
              <TextArea
                rows={3}
                maxLength={500}
                showCount
                placeholder={t('partyDeclaration.reasonPlaceholder')}
              />
            </Form.Item>

            <Form.Item
              label={t('partyDeclaration.fieldEvidence')}
              extra={t('partyDeclaration.evidenceHint', {
                count: DECLARATION_EVIDENCE_MAX_COUNT,
                size: DECLARATION_EVIDENCE_MAX_SIZE_MB,
              })}
            >
              <Upload
                multiple
                fileList={evidences}
                customRequest={uploadEvidence}
                beforeUpload={beforeUploadEvidence}
                onChange={({ fileList }) => setEvidences(fileList)}
                maxCount={DECLARATION_EVIDENCE_MAX_COUNT}
                accept="image/*,.pdf"
              >
                <Button icon={<UploadOutlined />}>{t('partyDeclaration.uploadEvidence')}</Button>
              </Upload>
            </Form.Item>

            <Form.Item className="leave-submit-item">
              <Button type="primary" htmlType="submit" loading={submitting}>
                {t('partyDeclaration.submit')}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </section>

      <section className="panel-card">
        <header className="panel-card-header">
          <h3 className="panel-card-title">{t('partyDeclaration.listTitle')}</h3>
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
                title: t('partyDeclaration.rowClickHint'),
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

      {/* 申报详情：点击记录行打开，底部提供「撤回 / 删除」操作；隐藏请假专属字段 */}
      <LeaveDetailModal
        open={detailId !== null}
        leaveId={detailId}
        onClose={() => setDetailId(null)}
        hideLeaveOnlyFields
        footerExtra={
          detailId !== null ? (
            <>
              <Popconfirm
                title={t('leaveApply.withdrawConfirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                okButtonProps={{ loading: acting === 'cancel' }}
                onConfirm={() => void withdrawDeclaration(detailId)}
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
                onConfirm={() => void removeDeclaration(detailId)}
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
