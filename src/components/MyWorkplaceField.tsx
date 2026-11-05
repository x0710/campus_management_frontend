import { EditOutlined } from '@ant-design/icons'
import { App, Button, Input, Modal, Space } from 'antd'
import axios from 'axios'
import { useRef, useState } from 'react'
import { updateMemberWorkplace } from '../api/organizations'
import { useErrorFeedback } from '../composables/useErrorFeedback'
import { useT } from '../i18n'

interface Props {
  memberId: number
  workplace: string | null
  onSaved: (workplace: string | null) => void
}

/** 仅在本人档案使用，按单条任职记录编辑，避免多职位工作地点被一起覆盖。 */
export default function MyWorkplaceField({ memberId, workplace, onSaved }: Props) {
  const t = useT()
  const { message } = App.useApp()
  const reportError = useErrorFeedback()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)

  const save = async () => {
    if (submitting.current) return
    submitting.current = true
    setSaving(true)
    try {
      const next = draft.trim() || null
      await updateMemberWorkplace(memberId, next)
      onSaved(next)
      setOpen(false)
      message.success(t('profile.saveSuccess'))
    } catch (error) {
      if (!(axios.isAxiosError(error) && error.response?.status === 401)) reportError(error)
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <Space wrap>
        <span>{workplace?.trim() || t('profile.noData')}</span>
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => {
          setDraft(workplace ?? '')
          setOpen(true)
        }}>
          {t('common.edit')}
        </Button>
      </Space>
      <Modal
        open={open}
        title={t('profile.editWorkplace')}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        mask={{ closable: !saving }}
        keyboard={!saving}
        onCancel={() => { if (!submitting.current) setOpen(false) }}
        onOk={() => void save()}
        destroyOnHidden
      >
        <label>
          {t('profile.workplace')}
          <Input value={draft} onChange={(event) => setDraft(event.target.value)}
            placeholder={t('profile.workplaceHint')} allowClear disabled={saving} />
        </label>
      </Modal>
    </>
  )
}
