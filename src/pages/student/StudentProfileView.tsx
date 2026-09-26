/** 学生端个人信息：汇总用户基本资料、角色、组织任职。所有数据均来自会话级缓存，避免重复请求。 */

import {
  BankOutlined,
  EditOutlined,
  SolutionOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Skeleton, Space, Tag, Typography } from 'antd'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import UserProfileEditModal from '../../components/UserProfileEditModal'
import { getCurrentUser } from '../../api/auth'
import { getRole, queryUserRoleRelations } from '../../api/rbac'
import type { RoleInfo } from '../../api/types/rbac'
import { listUserOrganizations } from '../../api/organizations'
import type { UserOrganization } from '../../api/types/organizations'
import { getPosition } from '../../api/positions'
import type { PositionDetail } from '../../api/types/positions'
import { getUser } from '../../api/users'
import type { Gender, UserDetail } from '../../api/types/users'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'

const { Paragraph, Text } = Typography

/** 角色详情含查询失败标记，便于在 UI 中区分「无角色」与「加载失败」 */
interface RoleItem extends RoleInfo {
  loadError?: string
}

/** 组织任职项含职位详情（职位接口可能异常，保留原始 code 兜底） */
interface OrgItem extends UserOrganization {
  positionDetail?: PositionDetail
  positionError?: string
}

/** 学生端个人信息：汇总用户基本资料、角色、组织任职。所有数据均来自会话级缓存，避免重复请求。 */
export default function StudentProfileView() {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)

  const [user, setUser] = useState<UserDetail | null>(null)
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [orgs, setOrgs] = useState<OrgItem[]>([])

  const [loading, setLoading] = useState(true)
  // 错误信息保留后端状态码，便于调试（如 "403 Forbidden"、"404 Not Found"）
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1) 当前登录用户 uid
      const me = await getCurrentUser()

      // 2) 并行拉取用户详情、角色关联、组织任职
      const [detail, relations, userOrgs] = await Promise.all([
        getUser(me.uid),
        queryUserRoleRelations(me.uid),
        listUserOrganizations(me.uid),
      ])

      // 3) 并发补齐角色详情（单个失败不影响其它）
      const roleItems = await Promise.all(
        relations.map(async (rel) => {
          try {
            const role = await getRole(rel.role_id)
            return role
          } catch (err) {
            const ax = axios.isAxiosError(err) ? err : undefined
            const code = ax?.response?.status
            return {
              id: rel.role_id,
              code: '',
              name: '',
              description: '',
              created_at: '',
              updated_at: '',
              loadError: code ? `${code} ${ax?.response?.statusText ?? 'Error'}` : 'Error',
            } as RoleItem
          }
        }),
      )

      // 4) 并发补齐职位详情（职位接口当前可能异常，单个失败不影响其它，保留原始 code）
      const orgItems: OrgItem[] = await Promise.all(
        userOrgs.map(async (uo) => {
          const item: OrgItem = { ...uo }
          if (!uo.position) return item
          try {
            item.positionDetail = await getPosition(uo.position)
          } catch (err) {
            const ax = axios.isAxiosError(err) ? err : undefined
            const code = ax?.response?.status
            item.positionError = code
              ? `${code} ${ax?.response?.statusText ?? 'Error'}`
              : 'Error'
          }
          return item
        }),
      )

      setUser(detail)
      setRoles(roleItems)
      setOrgs(orgItems)
    } catch (err) {
      const ax = axios.isAxiosError(err) ? err : undefined
      if (ax?.response?.status === 401) return
      const code = ax?.response?.status
      setError(
        code ? `${code} ${ax?.response?.statusText ?? 'Error'}` : t('common.loadFailed'),
      )
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const genderLabel = useMemo(() => {
    if (!user) return null
    switch (user.gender as Gender | null) {
      case 'male':
        return t('profile.male')
      case 'female':
        return t('profile.female')
      default:
        return t('profile.unknown')
    }
  }, [user, t])

  return (
    <section className="panel-card" style={{width:'100%',maxWidth:'unset'}}>
      <header className="panel-card-header">
        <h3 className="panel-card-title">{t('profile.title')}</h3>
        <Button
          type="primary"
          ghost
          icon={<EditOutlined />}
          disabled={!user}
          onClick={() => setEditOpen(true)}
        >
          {t('profile.edit')}
        </Button>
      </header>
      <div className="panel-card-body">
        {loading ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : error ? (
          <Alert type="error" showIcon title={error} />
        ) : user ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 基本信息 */}
            <Card
              size="small"
              title={
                <Space>
                  <SolutionOutlined />
                  {t('profile.basicInfo')}
                </Space>
              }
            >
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label={t('profile.name')}>
                  {user.name ?? t('profile.noData')}
                </Descriptions.Item>
                <Descriptions.Item label={t('profile.gender')}>
                  {genderLabel}
                </Descriptions.Item>
                <Descriptions.Item label={t('profile.email')}>
                  {user.email ?? t('profile.noData')}
                </Descriptions.Item>
                <Descriptions.Item label={t('profile.phone')}>
                  {user.phone ?? t('profile.noData')}
                </Descriptions.Item>
                <Descriptions.Item label={t('profile.birthday')}>
                  {user.birthday ?? t('profile.noData')}
                </Descriptions.Item>
                <Descriptions.Item label={t('profile.createdAt')}>
                  {formatDateTime(user.created_at, locale)}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 格言（avatar 字段实际存储格言） */}
            <Card size="small" title={t('profile.avatar')}>
              <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                {user.avatar && user.avatar.trim() ? user.avatar : t('profile.noData')}
              </Paragraph>
            </Card>

            {/* 系统角色 */}
            <Card
              size="small"
              title={
                <Space>
                  <TeamOutlined />
                  {t('profile.rolesTitle')}
                </Space>
              }
            >
              {roles.length === 0 ? (
                <Text type="secondary">{t('profile.noData')}</Text>
              ) : (
                <Space size={[8, 8]} wrap>
                  {roles.map((role) =>
                    role.loadError ? (
                      <Tag key={role.id} color="error">
                        ID:{role.id} · {role.loadError}
                      </Tag>
                    ) : (
                      <Tag key={role.id} color="blue">
                        {role.name}
                        {role.description ? (
                          <Text type="secondary" style={{ marginLeft: 4 }}>
                            ({role.description})
                          </Text>
                        ) : null}
                      </Tag>
                    ),
                  )}
                </Space>
              )}
            </Card>

            {/* 组织任职 */}
            <Card
              size="small"
              title={
                <Space>
                  <BankOutlined />
                  {t('profile.orgsTitle')}
                </Space>
              }
            >
              {orgs.length === 0 ? (
                <Text type="secondary">{t('profile.noData')}</Text>
              ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {orgs.map((uo) => (
                    <Card
                      key={uo.id}
                      size="small"
                      bordered
                      style={{ background: 'transparent' }}
                    >
                      <Descriptions column={2} size="small">
                        <Descriptions.Item label={t('profile.organization')}>
                          {uo.organization_name}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('profile.position')}>
                          {uo.positionDetail ? (
                            <Space>
                              <Tag color="geekblue">{uo.positionDetail.name}</Tag>
                              {uo.positionDetail.description ? (
                                <Text type="secondary" style={{ marginLeft: 4 }}>
                                  {uo.positionDetail.description}
                                </Text>
                              ) : null}
                            </Space>
                          ) : uo.position ? (
                            <Space>
                              <Tag color="default">{uo.position}</Tag>
                              {uo.positionError ? (
                                <Text type="danger" style={{ fontSize: 12 }}>
                                  ({uo.positionError})
                                </Text>
                              ) : null}
                            </Space>
                          ) : (
                            t('profile.noData')
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('profile.workplace')} span={2}>
                          {uo.workplace ?? t('profile.noData')}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                  ))}
                </Space>
              )}
            </Card>
          </Space>
        ) : null}
      </div>

      {user ? (
        <UserProfileEditModal
          open={editOpen}
          uid={user.id}
          onClose={() => setEditOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </section>
  )
}
