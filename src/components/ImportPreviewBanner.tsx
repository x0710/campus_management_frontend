import { getPortalPath } from '../config/routes'
import { usePortalParams } from '../hooks/usePortalParams'
import { Alert, Button, Modal, Space, Table } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useImportPreview } from '../store/importPreview'
import { useT } from '../i18n'

export default function ImportPreviewBanner() {
  const t = useT()
  const navigate = useNavigate()
  const { portalKey } = usePortalParams()
  const [open, setOpen] = useState(false)
  const preview = useImportPreview((state) => state.preview)
  if (!preview) return null
  return <><Alert
    type="warning" showIcon
    title={t('bulkMembers.previewActive', { n: preview.members.length, file: preview.fileName })}
    description={t('bulkMembers.previewNotice')}
    action={<Space wrap><Button onClick={() => setOpen(true)}>{t('bulkMembers.viewPreviewMembers')}</Button><Button onClick={() => {
      useImportPreview.getState().clear()
      navigate(preview.returnTo, { replace: true })
    }}>{t('bulkMembers.exitPreview')}</Button></Space>}
    style={{ marginBottom: 12 }}
  />
    <Modal open={open} onCancel={() => setOpen(false)} footer={null} width={960}
      title={t('bulkMembers.viewPreviewMembers')}>
      <Table rowKey="uid" dataSource={preview.members} pagination={{ pageSize: 20 }} scroll={{ x: 700 }}
        columns={[
          { title: 'UID', dataIndex: 'uid' },
          { title: t('bulkMembers.col.name'), dataIndex: 'name' },
          { title: t('bulkMembers.col.orgIdentity'), render: (_, member) => member.orgIdentities.map((org) =>
            `${preview.organizations.find((item) => item.id === org.orgId)?.name ?? org.orgId}: ${org.positions.join('/')}`
          ).join('；') },
          { title: t('bulkMembers.col.roles'), render: (_, member) => member.roleIds.map((id) =>
            preview.roles.find((role) => role.id === id)?.name ?? id).join(' / ') || '—' },
          { title: t('memberDetail.detail'), render: (_, member) => <Button type="link" onClick={() => {
            setOpen(false)
            navigate(`${getPortalPath(portalKey)}/organization-members/${member.uid}?from=${preview.returnTo.split('/').pop()}`)
          }}>{t('memberDetail.detail')}</Button> },
        ]}
      />
    </Modal>
  </>
}
