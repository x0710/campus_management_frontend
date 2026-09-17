import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  List,
  Radio,
  Row,
  Select,
  Space,
  Typography,
  message,
} from 'antd'
import { useState } from 'react'
import { useT } from '../../i18n'

/**
 * 学生端：心理咨询预约（填写预约表单）。
 * 注意：当前为【模拟数据预览页】，后端尚无预约接口。
 * 提交仅在前端模拟：弹出成功提示并清空表单，不产生真实请求；
 * 接口就绪后把 handleFinish 中的 setTimeout 替换为 src/api/ 调用即可。
 */

/** 咨询类型 key，对应 i18n 文案 counseling.type_* */
type CounselType = 'academic' | 'interpersonal' | 'emotion' | 'career' | 'other'
/** 预约时段 key，对应 i18n 文案 counseling.slot_* */
type CounselSlot = 'morning' | 'afternoon' | 'evening'

interface BookingFormValues {
  type: CounselType
  /** antd DatePicker 的值为 dayjs 对象 */
  date: { toDate: () => Date }
  slot: CounselSlot
  note?: string
}

const TYPE_OPTIONS: CounselType[] = ['academic', 'interpersonal', 'emotion', 'career', 'other']
const SLOT_OPTIONS: CounselSlot[] = ['morning', 'afternoon', 'evening']

export default function CounselingBookingView() {
  const t = useT()
  const [form] = Form.useForm<BookingFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  // 模拟提交：延迟 600ms 后提示成功并重置表单
  const handleFinish = () => {
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      messageApi.success(t('counseling.success'))
      form.resetFields()
    }, 600)
  }

  return (
    <section className="panel-card" style={{ width: '100%', maxWidth: 'unset' }}>
      {contextHolder}
      <header className="panel-card-header">
        <h3 className="panel-card-title">{t('counseling.title')}</h3>
      </header>
      <div className="panel-card-body">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert type="warning" showIcon title={t('common.mockHint')} />

          {/* 左侧预约表单 + 右侧预约须知；窄屏下须知卡自动落到下方 */}
          <Row gutter={[16, 16]} align="stretch">
            <Col xs={24} lg={15}>
              <Card size="small" className="booking-form-card">
                <Form<BookingFormValues>
                  form={form}
                  layout="vertical"
                  requiredMark="optional"
                  onFinish={handleFinish}
                >
                  <Form.Item
                    name="type"
                    label={t('counseling.formType')}
                    rules={[{ required: true, message: t('counseling.requiredType') }]}
                  >
                    <Select
                      placeholder={t('counseling.typePlaceholder')}
                      options={TYPE_OPTIONS.map((value) => ({
                        value,
                        label: t(`counseling.type_${value}`),
                      }))}
                    />
                  </Form.Item>

                  <Form.Item
                    name="date"
                    label={t('counseling.formDate')}
                    rules={[{ required: true, message: t('counseling.requiredDate') }]}
                  >
                    <DatePicker
                      style={{ width: '100%' }}
                      allowClear={false}
                      disabledDate={(current) => {
                        // 不能预约今天之前的日期
                        if (!current) return false
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        return current.toDate() < today
                      }}
                    />
                  </Form.Item>

                  <Form.Item
                    name="slot"
                    label={t('counseling.formSlot')}
                    rules={[{ required: true, message: t('counseling.requiredSlot') }]}
                  >
                    <Radio.Group optionType="button" buttonStyle="solid">
                      {SLOT_OPTIONS.map((value) => (
                        <Radio key={value} value={value}>
                          {t(`counseling.slot_${value}`)}
                        </Radio>
                      ))}
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item name="note" label={t('counseling.formNote')}>
                    <Input.TextArea
                      rows={4}
                      maxLength={200}
                      showCount
                      placeholder={t('counseling.notePlaceholder')}
                    />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" loading={submitting}>
                      {submitting ? t('counseling.submitting') : t('counseling.submit')}
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </Col>

            <Col xs={24} lg={9}>
              <Card size="small" title={t('counseling.noticeTitle')} className="booking-notice-card">
                <List
                  size="small"
                  split={false}
                  dataSource={[1, 2, 3, 4, 5]}
                  renderItem={(idx) => (
                    <List.Item className="booking-notice-item">
                      <Typography.Text>{t(`counseling.notice_${idx}`)}</Typography.Text>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </Space>
      </div>
    </section>
  )
}
