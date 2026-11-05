import { App, Alert, Button, Form, Input, InputNumber, Modal } from 'antd'
import { useEffect, useState } from 'react'
import { getCurrentUser } from '../api/auth'
import { deductPartyScore } from '../api/partyScores'
import { useErrorFeedback } from '../composables/useErrorFeedback'
import { useT } from '../i18n'
import { useUserNames } from '../composables/useUserNames'

export default function PartyScoreDeductionButton({ userId, onSaved }: {
  userId: number
  onSaved: () => void
}) {
  const t = useT()
  const { message } = App.useApp()
  const reportError = useErrorFeedback()
  const names = useUserNames([userId])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewerId, setViewerId] = useState<number | null>(null)
  const [form] = Form.useForm<{ score: string; reason: string }>()

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then((me) => {
      if (!cancelled) setViewerId(me.uid)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const submit = async () => {
    if (saving) return
    let values: { score: string; reason: string }
    try {
      values = await form.validateFields()
    } catch { return }
    setSaving(true)
    try {
      await deductPartyScore({ user_id: userId, score: String(values.score), reason: values.reason.trim() })
      message.success(t('partyDeduction.success'))
      setOpen(false)
      onSaved()
    } catch (err) {
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  if (viewerId === null || viewerId === userId) return null

  return <>
    <Button danger onClick={() => { form.resetFields(); setOpen(true) }}>
      {t('partyDeduction.action')}
    </Button>
    <Modal open={open} title={t('partyDeduction.action')} confirmLoading={saving}
      onOk={() => void submit()} onCancel={() => { if (!saving) setOpen(false) }}
      okText={t('partyDeduction.confirm')} okButtonProps={{ danger: true }}
      cancelButtonProps={{ disabled: saving }} closable={!saving} mask={{ closable: !saving }}>
      <Alert type="warning" showIcon title={t('partyDeduction.hint')} style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical">
        <Form.Item label={t('partyDeduction.target')}><span>{names.get(userId) || `#${userId}`}</span></Form.Item>
        <Form.Item name="score" label={t('partyDeduction.score')} rules={[
          { required: true, message: t('partyDeduction.scoreRequired') },
          { validator: (_, value: unknown) => {
            const raw = String(value ?? '')
            return /^\d+(\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)) && Number(raw) > 0
              ? Promise.resolve() : Promise.reject(new Error(t('partyDeduction.scoreRequired')))
          } },
        ]}>
          <InputNumber stringMode style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="reason" label={t('partyDeduction.reason')}
          rules={[{ required: true, whitespace: true, message: t('partyDeduction.reasonRequired') }]}>
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Modal>
  </>
}
