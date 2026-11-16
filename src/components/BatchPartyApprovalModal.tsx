import { Alert, Button, Form, Input, InputNumber, Modal, Space, Table, Tag } from 'antd'
import { useRef, useState } from 'react'
import { approvePartyScore, rejectPartyScore } from '../api/partyScores'
import { extractErrorReason } from '../api/common'
import { useRequestSequence } from '../composables/useRequestSequence'
import { PARTY_SCORE_REASON_MAX_LENGTH } from '../config/partyDeclaration'
import { useT } from '../i18n'
import { runBatchApproval } from '../utils/batchApproval'

export interface BatchApprovalItem { id: number; applicationId: number; applicant: string; score: string }

/** 每次打开挂载新实例，冻结本批次对象；成功项不再提交。 */
export default function BatchPartyApprovalModal({ items, action, onClose, onUpdated }: {
  items: BatchApprovalItem[]
  action: 'approve' | 'reject'
  onClose: () => void
  onUpdated: () => void
}) {
  const t = useT()
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const requests = useRequestSequence()
  const [results, setResults] = useState<Record<number, { success: boolean; error?: string }>>({})
  const remaining = items.filter((item) => !results[item.id]?.success)
  const submit = async () => {
    if (lock.current) return
    lock.current = true
    try {
      const values = await form.validateFields()
      const isCurrent = requests.begin()
      setBusy(true)
      await runBatchApproval(remaining, async (item) => {
        const comment = values.comment.trim()
        if (action === 'approve') await approvePartyScore(item.id, { comment, reviewed_score: String(values.scores[item.id]) })
        else await rejectPartyScore(item.id, { comment })
      }, isCurrent, (item, result) => {
        setResults((prev) => ({ ...prev, [item.id]: result.success
          ? { success: true } : { success: false, error: extractErrorReason(result.error, t) } }))
      })
      if (isCurrent()) { setBusy(false); onUpdated() }
    } catch { /* 表单校验错误由字段展示。 */ }
    finally { lock.current = false }
  }
  return <Modal open width={800} title={t(`partyScoreApproval.batch_${action}`)}
    closable={!busy} maskClosable={false} keyboard={!busy} onCancel={onClose}
    footer={<Space>
      <Button disabled={busy} onClick={onClose}>{t('common.close')}</Button>
      <Button type="primary" danger={action === 'reject'} loading={busy} disabled={!remaining.length} onClick={() => void submit()}>
        {t(Object.keys(results).length ? 'partyScoreApproval.batchRetry' : 'partyScoreApproval.batchConfirm')}
      </Button>
    </Space>}>
    <Alert type="info" showIcon title={t('partyScoreApproval.batchHint', { n: items.length })} style={{ marginBottom: 16 }} />
    <Form form={form} layout="vertical" disabled={busy} initialValues={{ scores: Object.fromEntries(items.map((item) => [item.id, item.score])) }}>
      <Table rowKey="id" dataSource={items} pagination={false} scroll={{ y: 320, x: 600 }} columns={[
        { title: t('partyScoreApproval.colAppId'), dataIndex: 'applicationId' },
        { title: t('partyScoreApproval.colApplicant'), dataIndex: 'applicant' },
        { title: t('partyScoreApproval.colRequestedScore'), dataIndex: 'score' },
        ...(action === 'approve' ? [{ title: t('partyScoreApproval.reviewedScoreLabel'), render: (_: unknown, item: BatchApprovalItem) =>
          <Form.Item name={['scores', item.id]} style={{ marginBottom: 0 }} rules={[{ required: true, message: t('partyScoreApproval.reviewedScoreRequired') }]}>
            <InputNumber stringMode step="0.01" disabled={busy || results[item.id]?.success} />
          </Form.Item> }] : []),
        { title: t('partyScoreApproval.colStatus'), render: (_: unknown, item: BatchApprovalItem) => results[item.id]
          ? results[item.id].success ? <Tag color="success">{t(`partyScoreApproval.${action}Success`)}</Tag>
            : <span role="alert">{results[item.id].error}</span>
          : t('partyScoreApproval.batchQueued') },
      ]} />
      <Form.Item name="comment" label={t('partyScoreApproval.commentLabel')} rules={[{ required: true, whitespace: true, message: t('partyScoreApproval.commentRequired') }]}>
        <Input.TextArea rows={3} showCount maxLength={PARTY_SCORE_REASON_MAX_LENGTH} />
      </Form.Item>
    </Form>
  </Modal>
}
