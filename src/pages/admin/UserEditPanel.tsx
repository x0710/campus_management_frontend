import {
  App as AntdApp,
  AutoComplete,
  Button,
  DatePicker,
  Divider,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Table,
  Tag,
  TreeSelect,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  addOrgMember,
  listUserOrganizations,
  removeOrgMember,
  type OrganizationInfo,
  type UserOrganization,
} from '../../api/organizations'
import { type PositionDetail } from '../../api/positions'
import { assignUserRoles, queryUserRoleRelations } from '../../api/rbac'
import { getUser, updateUser, type UserDetail, type Gender } from '../../api/users'
import { extractError } from '../../api/common'
import { useT } from '../../i18n'

interface ProfileFormValues {
  name?: string
  email?: string
  phone?: string
  birthday?: Dayjs | null
  gender?: Gender
}

interface Props {
  uid: number
  roles: { id: number; code: string; name: string }[]
  organizations: OrganizationInfo[]
  positions: PositionDetail[]
  onChanged: () => void
}

/** 编辑用户：资料修改（PATCH /users/{id}）、角色分配（POST /rbac/users/{uid}）、组织任职管理 */
export default function UserEditPanel({ uid, roles, organizations, positions, onChanged }: Props) {
  const t = useT()
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm<ProfileFormValues>()

  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)

  const [roleIds, setRoleIds] = useState<number[]>([])
  const [savingRoles, setSavingRoles] = useState(false)
  const [initialRoleIds, setInitialRoleIds] = useState<number[]>([])

  const [orgRelations, setOrgRelations] = useState<UserOrganization[]>([])
  const [newOrgId, setNewOrgId] = useState<number | null>(null)
  const [newPosition, setNewPosition] = useState('')
  const [newWorkplace, setNewWorkplace] = useState('')
  const [orgBusy, setOrgBusy] = useState<string | null>(null)

  const showError = useCallback(
    (err: unknown) => {
      const code = extractError(err)
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, orgs] = await Promise.all([getUser(uid), listUserOrganizations(uid)])
      setDetail(d)
      setOrgRelations(orgs)
      form.setFieldsValue({
        name: d.name ?? '',
        email: d.email ?? '',
        phone: d.phone ?? '',
        birthday: d.birthday ? dayjs(d.birthday) : null,
        gender: (d.gender as Gender | null) ?? undefined,
      })
    } catch (err) {
      if (!(axios.isAxiosError(err) && err.response?.status === 401)) showError(err)
    } finally {
      setLoading(false)
    }
  }, [uid, form, showError])

  // 当前用户的角色：GET /rbac/users/{uid}/role-relations 仅返回 role_id（走会话缓存）
  const loadRoleRelations = useCallback(async () => {
    try {
      const items = await queryUserRoleRelations(uid)
      const ids = items.map((i) => i.role_id)
      setRoleIds(ids)
      setInitialRoleIds(ids)
    } catch {
      // 忽略：无权限时保留空
    }
  }, [uid])

  useEffect(() => {
    void load()
    void loadRoleRelations()
  }, [load, loadRoleRelations])

  const orgOptions = useMemo(
    () => organizations.map((o) => ({ value: o.id, title: `${o.name}（${o.code}）` })),
    [organizations],
  )
  const positionOptions = useMemo(
    () => positions.map((p) => ({ value: p.code, label: `${p.name}（${p.code}）` })),
    [positions],
  )

  const saveProfile = async () => {
    const values = await form.validateFields()
    setSavingProfile(true)
    try {
      await updateUser(uid, {
        name: values.name?.trim() || undefined,
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : undefined,
        gender: values.gender,
      })
      message.success(t('adminUsers.profileSaved'))
      onChanged()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      showError(err)
    } finally {
      setSavingProfile(false)
    }
  }

  const saveRoles = async () => {
    if (roleIds.length === 0) {
      message.warning(t('adminUsers.roleRequired'))
      return
    }
    setSavingRoles(true)
    try {
      await assignUserRoles(uid, roleIds)
      setInitialRoleIds(roleIds)
      message.success(t('adminUsers.roleSaved'))
      onChanged()
    } catch (err) {
      showError(err)
    } finally {
      setSavingRoles(false)
    }
  }

  const addRelation = async () => {
    if (newOrgId === null || !newPosition.trim()) return
    setOrgBusy('add')
    try {
      await addOrgMember(newOrgId, {
        user_id: uid,
        position: newPosition.trim(),
        workplace: newWorkplace.trim() || null,
      })
      message.success(t('adminOrg.memberAddSuccess'))
      setNewOrgId(null)
      setNewPosition('')
      setNewWorkplace('')
      const orgs = await listUserOrganizations(uid)
      setOrgRelations(orgs)
    } catch (err) {
      showError(err)
    } finally {
      setOrgBusy(null)
    }
  }

  const removeRelation = async (rel: UserOrganization) => {
    setOrgBusy(`rel-${rel.id}`)
    try {
      await removeOrgMember(rel.organization_id, {
        user_id: uid,
        position: rel.position,
        workplace: rel.workplace,
      })
      message.success(t('adminOrg.memberRemoveSuccess'))
      setOrgRelations((list) => list.filter((x) => x.id !== rel.id))
    } catch (err) {
      showError(err)
    } finally {
      setOrgBusy(null)
    }
  }

  const relationColumns = useMemo<ColumnsType<UserOrganization>>(
    () => [
      {
        title: t('adminUsers.colOrg'),
        dataIndex: 'organization_name',
        key: 'organization_name',
        width: 200,
      },
      {
        title: t('adminOrg.colPosition'),
        dataIndex: 'position',
        key: 'position',
        width: 150,
        render: (v: string) => <Tag color="blue">{v}</Tag>,
      },
      {
        title: t('adminOrg.colWorkplace'),
        dataIndex: 'workplace',
        key: 'workplace',
        render: (v: string | null) => v || '—',
      },
      {
        title: t('approval.colAction'),
        key: 'action',
        width: 90,
        render: (_, record) => (
          <Popconfirm
            title={t('adminUsers.relationRemoveConfirm')}
            okText={t('adminOrg.remove')}
            cancelText={t('approval.cancel')}
            okButtonProps={{ danger: true, loading: orgBusy === `rel-${record.id}` }}
            onConfirm={() => void removeRelation(record)}
          >
            <Button type="link" size="small" danger>
              {t('adminOrg.remove')}
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [t, orgBusy],
  )

  if (loading || !detail) {
    return <Empty description={t('common.loading')} />
  }

  return (
    <div className="user-edit-panel">
      <Form form={form} layout="vertical">
        <div className="leave-form-grid">
          <Form.Item name="name" label={t('adminUsers.fieldName')}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="gender" label={t('adminUsers.fieldGender')}>
            <Select
              allowClear
              options={[
                { value: 'male', label: t('adminUsers.genderMale') },
                { value: 'female', label: t('adminUsers.genderFemale') },
              ]}
            />
          </Form.Item>
          <Form.Item name="email" label={t('adminUsers.fieldEmail')}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item name="phone" label={t('adminUsers.fieldPhone')}>
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item name="birthday" label={t('adminUsers.fieldBirthday')}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div className="user-edit-actions">
          <Button type="primary" loading={savingProfile} onClick={() => void saveProfile()}>
            {t('adminUsers.saveProfile')}
          </Button>
        </div>
      </Form>

      <Divider />

      <div className="user-edit-roles">
        <span className="user-edit-label">{t('adminUsers.fieldRoles')}</span>
        <Select
          mode="multiple"
          className="user-edit-roles-select"
          value={roleIds}
          options={roles.map((r) => ({ value: r.id, label: `${r.name}（${r.code}）` }))}
          onChange={(v: number[]) => setRoleIds(v)}
          optionFilterProp="label"
        />
        <Button
          type="primary"
          ghost
          loading={savingRoles}
          disabled={shallowEq(roleIds, initialRoleIds)}
          onClick={() => void saveRoles()}
        >
          {t('adminUsers.saveRoles')}
        </Button>
      </div>

      <Divider />

      <div className="user-edit-label">{t('adminUsers.orgRelations')}</div>
      <div className="org-add-member" style={{ margin: '8px 0' }}>
        <TreeSelect
          className="org-add-member-uid"
          treeData={orgOptions}
          value={newOrgId}
          onChange={(v: number | null) => setNewOrgId(v)}
          allowClear
          showSearch
          treeNodeFilterProp="title"
          placeholder={t('adminUsers.selectOrg')}
        />
        <AutoComplete
          className="org-add-member-pos"
          options={positionOptions}
          value={newPosition}
          onChange={(v: string) => setNewPosition(v)}
          placeholder={t('adminOrg.positionPlaceholder')}
          filterOption={(input: string, option?: { label?: unknown }) =>
            String(option?.label ?? '')
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          allowClear
        />
        <Input
          className="org-add-member-place"
          value={newWorkplace}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewWorkplace(e.target.value)}
          placeholder={t('adminOrg.workplacePlaceholder')}
        />
        <Button
          type="primary"
          loading={orgBusy === 'add'}
          disabled={newOrgId === null || !newPosition.trim()}
          onClick={() => void addRelation()}
        >
          {t('adminUsers.addRelation')}
        </Button>
      </div>
      <Table<UserOrganization>
        rowKey="id"
        size="small"
        columns={relationColumns}
        dataSource={orgRelations}
        locale={{ emptyText: t('common.noData') }}
        pagination={false}
      />
    </div>
  )
}

function shallowEq(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every((x) => sb.has(x))
}
