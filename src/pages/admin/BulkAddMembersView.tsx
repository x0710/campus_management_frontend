/**
 * 党委学校端：批量添加新成员（填报辅助 + 表格校验）。
 *
 * 入口：组织成员管理左侧组织树「新建组织」旁的「批量添加新成员」按钮
 *       → /portal/:portalKey/bulk-add-members?from=<moduleKey>
 *
 * 页面结构（整个页面只有一张表格，靠表头切换查看内容）：
 *   1. 组织与 ID 对应表：填写「组织:身份」列时，冒号前填这里的组织 ID；
 *   2. 身份（职位）与编码对应表：冒号后填这里的身份编码；
 *   3. 系统角色与 ID 对应表：填写「系统角色」列时使用这里的角色 ID（只填数字）；
 *   4. 样表说明：样表十一列的含义、是否必填与两行示例。
 *
 * 下载的样表是一份 Excel：第 1 张工作表是「新成员」填写模板（第 5 行起填数据），
 * 之后是「填写说明」与组织 / 身份 / 系统角色三张对照表，可直接在 Excel 里查编码。
 *
 * 「导入表格并分析」只接受 .xlsx：读取后从第 5 行开始逐行校验组织、身份、角色、
 * 手机号、生日、入党时间与必填密码；有问题弹窗逐条列出并可导出报错日志，全部通过后
 * 才展示「开始导入」。
 *
 * 数据来源（均走 api 层的会话内缓存，重复进入页面不重复请求，代码要求 5）：
 *   GET /api/organizations、GET /api/positions、GET /api/rbac/roles（分页循环取全量）
 */
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  ImportOutlined,
  InfoCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Modal, Progress, Segmented, Space, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { extractErrorReason } from '../../api/common'
import { listAllOrganizations } from '../../api/organizations'
import { listAllPositions } from '../../api/positions'
import { listAllRoles } from '../../api/rbac'
import type { OrganizationInfo } from '../../api/types/organizations'
import type { PositionDetail } from '../../api/types/positions'
import type { RoleInfo } from '../../api/types/rbac'
import LookupTableCard, { LookupRefreshButton } from '../../components/LookupTableCard'
import {
  BULK_DATA_START_ROW,
  BULK_IMPORT_EXTENSION,
  BULK_MEMBER_TEMPLATE_FILE_NAME,
  BULK_ORG_IDENTITY_EXAMPLE,
  BULK_ROLE_EXAMPLE,
  BULK_TEMPLATE_COLUMNS,
  type BulkLookupKey,
} from '../../config/bulkMembers'
import { SCHOOL_ORG_ADMIN_MODULE_KEY } from '../../config/organization'
import { useT } from '../../i18n'
import {
  analyzeMemberRows,
  type MemberCheckIssue,
  type MemberCheckResult,
} from '../../utils/bulkMemberCheck'
import { importMemberRows, type MemberImportOutcome } from '../../utils/bulkMemberImport'
import { buildMemberTemplateSheets } from '../../utils/bulkMemberTemplate'
import { downloadTextFile } from '../../utils/download'
import { downloadXlsx } from '../../utils/xlsx'
import { readXlsx } from '../../utils/xlsxReader'

/** 页内可切换的表格：三张对照表 + 样表说明 */
type BulkTableKey = BulkLookupKey | 'template'

/** 样表说明表的行数据（由 config/bulkMembers 的列定义派生） */
interface TemplateColumnRow {
  key: string
  label: string
  description: string
  required: boolean
  sampleA: string
  sampleB: string
}

/** 一次导入分析的结果（含文件名，便于导出日志） */
interface AnalysisState {
  fileName: string
  result: MemberCheckResult
}

/**
 * 批量添加新成员辅助页。
 * @returns 页面元素（四张表切换 + 导入分析）
 */
export default function BulkAddMembersView() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { portalKey } = useParams<{ portalKey: string }>()
  const { message } = AntdApp.useApp()

  // 返回时回到来源模块（默认党委学校端「组织成员管理」）
  const fromModuleKey =
    new URLSearchParams(location.search).get('from') ?? SCHOOL_ORG_ADMIN_MODULE_KEY

  // ---- 当前查看的表格 ----
  const [activeTable, setActiveTable] = useState<BulkTableKey>('orgs')

  // ---- 三张对照表的数据与状态（各自独立，单表失败不影响其他表） ----
  const [orgs, setOrgs] = useState<OrganizationInfo[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  const [positions, setPositions] = useState<PositionDetail[]>([])
  const [positionsLoading, setPositionsLoading] = useState(true)
  const [positionsError, setPositionsError] = useState<string | null>(null)

  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState<string | null>(null)

  // ---- 导入分析 ----
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null)
  const [issueOpen, setIssueOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // ---- 真实导入（写库）----
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [importOutcomes, setImportOutcomes] = useState<MemberImportOutcome[] | null>(null)
  const [resultOpen, setResultOpen] = useState(false)

  /**
   * 加载组织对照表。
   * @param force 是否绕过会话缓存强制刷新（默认 false）
   */
  const loadOrgs = useCallback(
    async (force = false) => {
      setOrgsLoading(true)
      setOrgsError(null)
      try {
        setOrgs(await listAllOrganizations(force))
      } catch (err) {
        // 401 由 http 拦截器统一处理登录态，页面不再重复提示
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setOrgsError(extractErrorReason(err, t))
        }
      } finally {
        setOrgsLoading(false)
      }
    },
    [t],
  )

  /**
   * 加载身份（职位）对照表。
   * @param force 是否绕过会话缓存强制刷新（默认 false）
   */
  const loadPositions = useCallback(
    async (force = false) => {
      setPositionsLoading(true)
      setPositionsError(null)
      try {
        setPositions(await listAllPositions(force))
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setPositionsError(extractErrorReason(err, t))
        }
      } finally {
        setPositionsLoading(false)
      }
    },
    [t],
  )

  /**
   * 加载系统角色对照表。
   * @param force 是否绕过会话缓存强制刷新（默认 false）
   */
  const loadRoles = useCallback(
    async (force = false) => {
      setRolesLoading(true)
      setRolesError(null)
      try {
        setRoles(await listAllRoles(force))
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          setRolesError(extractErrorReason(err, t))
        }
      } finally {
        setRolesLoading(false)
      }
    },
    [t],
  )

  // 三张表并行加载（互不阻塞；切换查看时无需重新请求）
  useEffect(() => {
    void loadOrgs()
    void loadPositions()
    void loadRoles()
  }, [loadOrgs, loadPositions, loadRoles])

  /** 组织 ID → 名称，用于展示「上级组织」与职位的「所属组织」 */
  const orgNameById = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs])

  // ============ 组织与 ID 对应表 ============
  const orgColumns = useMemo<ColumnsType<OrganizationInfo>>(
    () => [
      {
        title: t('bulkMembers.col.orgId'),
        dataIndex: 'id',
        key: 'id',
        width: 110,
        sorter: (a, b) => a.id - b.id,
      },
      {
        title: t('bulkMembers.col.orgCode'),
        dataIndex: 'code',
        key: 'code',
        width: 200,
        render: (value: string) => <span className="bulk-code">{value}</span>,
      },
      {
        title: t('bulkMembers.col.orgName'),
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: t('bulkMembers.col.orgParent'),
        key: 'parent',
        width: 240,
        render: (_, record) => {
          if (record.parent_id === null) return '—'
          const parentName = orgNameById.get(record.parent_id) ?? String(record.parent_id)
          return (
            <Tooltip title={parentName}>
              <span className="bulk-desc-cell">{parentName}</span>
            </Tooltip>
          )
        },
      },
    ],
    [t, orgNameById],
  )

  /** 组织表前端筛选：ID 精确、编码/名称模糊（大小写不敏感） */
  const filterOrg = useCallback((row: OrganizationInfo, keyword: string) => {
    const k = keyword.toLowerCase()
    return (
      String(row.id) === keyword ||
      row.code.toLowerCase().includes(k) ||
      row.name.toLowerCase().includes(k)
    )
  }, [])

  // ============ 身份（职位）与编码对应表 ============
  const positionColumns = useMemo<ColumnsType<PositionDetail>>(
    () => [
      {
        title: t('bulkMembers.col.posCode'),
        dataIndex: 'code',
        key: 'code',
        width: 200,
        render: (value: string) => <span className="bulk-code">{value}</span>,
      },
      {
        title: t('bulkMembers.col.posName'),
        dataIndex: 'name',
        key: 'name',
        width: 200,
      },
      {
        title: t('bulkMembers.col.posOrg'),
        dataIndex: 'organization_id',
        key: 'organization_id',
        width: 240,
        render: (value: number) => orgNameById.get(value) ?? value,
      },
      {
        title: t('bulkMembers.col.posDesc'),
        dataIndex: 'description',
        key: 'description',
        render: (value: string | null) =>
          value ? (
            <Tooltip title={value}>
              <span className="bulk-desc-cell">{value}</span>
            </Tooltip>
          ) : (
            '—'
          ),
      },
    ],
    [t, orgNameById],
  )

  /** 身份表前端筛选：编码/名称/说明模糊匹配 */
  const filterPosition = useCallback((row: PositionDetail, keyword: string) => {
    const k = keyword.toLowerCase()
    return (
      row.code.toLowerCase().includes(k) ||
      row.name.toLowerCase().includes(k) ||
      (row.description ?? '').toLowerCase().includes(k)
    )
  }, [])

  // ============ 系统角色与 ID 对应表 ============
  const roleColumns = useMemo<ColumnsType<RoleInfo>>(
    () => [
      {
        title: t('bulkMembers.col.roleId'),
        dataIndex: 'id',
        key: 'id',
        width: 110,
        sorter: (a, b) => a.id - b.id,
      },
      {
        title: t('bulkMembers.col.roleName'),
        dataIndex: 'name',
        key: 'name',
        width: 220,
      },
      {
        title: t('bulkMembers.col.roleCode'),
        dataIndex: 'code',
        key: 'code',
        width: 240,
        render: (value: string) => <span className="bulk-code">{value}</span>,
      },
      {
        title: t('bulkMembers.col.roleDesc'),
        dataIndex: 'description',
        key: 'description',
        render: (value: string) =>
          value ? (
            <Tooltip title={value}>
              <span className="bulk-desc-cell">{value}</span>
            </Tooltip>
          ) : (
            '—'
          ),
      },
    ],
    [t],
  )

  /** 角色表前端筛选：ID 精确、编码/名称/说明模糊匹配 */
  const filterRole = useCallback((row: RoleInfo, keyword: string) => {
    const k = keyword.toLowerCase()
    return (
      String(row.id) === keyword ||
      row.code.toLowerCase().includes(k) ||
      row.name.toLowerCase().includes(k) ||
      (row.description ?? '').toLowerCase().includes(k)
    )
  }, [])

  // ============ 样表说明 ============
  const templateRows = useMemo<TemplateColumnRow[]>(
    () =>
      BULK_TEMPLATE_COLUMNS.map((col) => ({
        key: col.key,
        label: t(col.labelKey),
        description: t(col.descKey),
        required: col.required,
        sampleA: col.sampleA,
        sampleB: col.sampleB,
      })),
    [t],
  )

  const templateColumns = useMemo<ColumnsType<TemplateColumnRow>>(
    () => [
      {
        title: t('bulkMembers.sampleCol.name'),
        dataIndex: 'label',
        key: 'label',
        width: 240,
        render: (value: string, record) => (
          <span className="bulk-sample-name">
            {value}
            {record.required && (
              <Tag color="red" variant="filled" className="bulk-required-tag">
                {t('bulkMembers.required')}
              </Tag>
            )}
          </span>
        ),
      },
      {
        title: t('bulkMembers.sampleCol.desc'),
        dataIndex: 'description',
        key: 'description',
      },
      {
        title: t('bulkMembers.sampleCol.sampleA'),
        dataIndex: 'sampleA',
        key: 'sampleA',
        width: 220,
        render: (value: string) => <span className="bulk-sample-value">{value}</span>,
      },
      {
        title: t('bulkMembers.sampleCol.sampleB'),
        dataIndex: 'sampleB',
        key: 'sampleB',
        width: 220,
        render: (value: string) => <span className="bulk-sample-value">{value}</span>,
      },
    ],
    [t],
  )

  /** 样表说明没有筛选需求，传一个恒真的筛选函数保持组件签名一致 */
  const filterTemplate = useCallback(() => true, [])

  /** 三张对照表是否还在加载（下载样表与导入分析都要等三张表就绪） */
  const lookupLoading = orgsLoading || positionsLoading || rolesLoading
  /** 对照表是否全部可用来做编码校验 */
  const lookupReady = !lookupLoading && !orgsError && !positionsError && !rolesError

  /**
   * 下载样表：一份 Excel 里同时写入「新成员」填写模板、填写说明与三张编码对照表，
   * 用户打开文件即可在同一份表格中查组织 ID / 身份编码 / 角色 ID（无需再回页面查找）。
   */
  const downloadTemplate = () => {
    const { sheets, missing } = buildMemberTemplateSheets({
      t,
      orgs,
      orgNameById,
      positions,
      roles,
    })

    if (missing.length > 0) {
      message.warning(t('bulkMembers.downloadPartial', { names: missing.join('、') }))
    } else {
      message.success(t('bulkMembers.downloadDone'))
    }
    downloadXlsx(BULK_MEMBER_TEMPLATE_FILE_NAME, sheets)
  }

  /** 表格校验问题的单行文案（弹窗与报错日志共用） */
  const formatIssue = useCallback(
    (issue: MemberCheckIssue) =>
      t('bulkMembers.issueLine', {
        row: issue.row,
        name: issue.name,
        message: issue.message,
      }),
    [t],
  )

  /** 点击「导入表格并分析」：先确认三张对照表已就绪，再打开文件选择框 */
  const pickFile = () => {
    if (!lookupReady) {
      message.warning(t('bulkMembers.analyzeTablesNotReady'))
      return
    }
    fileInputRef.current?.click()
  }

  /**
   * 选择文件后：读取 .xlsx → 从第 5 行起逐行校验 → 有问题弹窗、无问题展示「开始导入」。
   * @param event 文件框变更事件（必填）
   */
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 清空 value，允许连续选择同一个文件再次分析
    event.target.value = ''
    if (!file) return

    if (!file.name.toLowerCase().endsWith(BULK_IMPORT_EXTENSION)) {
      message.error(t('bulkMembers.analyzeOnlyXlsx'))
      return
    }

    setAnalyzing(true)
    try {
      const { rows } = await readXlsx(file)
      const result = analyzeMemberRows({
        rows,
        startRow: BULK_DATA_START_ROW,
        orgs,
        positions,
        roles,
        t,
      })

      if (result.total === 0) {
        setAnalysis(null)
        message.warning(t('bulkMembers.analyzeEmpty', { row: BULK_DATA_START_ROW }))
        return
      }

      setAnalysis({ fileName: file.name, result })
      if (result.issues.length > 0) {
        setIssueOpen(true)
      } else {
        message.success(t('bulkMembers.analyzePassed', { n: result.total }))
      }
    } catch (err) {
      setAnalysis(null)
      message.error(
        t('bulkMembers.analyzeReadFailed', {
          reason: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      setAnalyzing(false)
    }
  }

  /** 导出报错日志（纯文本，按行列出弹窗里看到的问题） */
  const exportIssueLog = () => {
    if (!analysis) return
    const { fileName, result } = analysis
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
    const lines = [
      t('bulkMembers.log.title'),
      t('bulkMembers.log.file', { name: fileName }),
      t('bulkMembers.log.time', { time: now.toLocaleString() }),
      t('bulkMembers.log.startRow', { row: BULK_DATA_START_ROW }),
      t('bulkMembers.log.count', { n: result.issues.length }),
      '',
      ...result.issues.map((issue) => formatIssue(issue)),
    ]
    downloadTextFile(t('bulkMembers.log.fileName', { stamp }), lines.join('\r\n'))
  }

  /**
   * 真正执行导入：逐行创建账号并补齐党员档案 / 角色 / 联系方式。
   * 只有校验通过（analysis 存在且无问题）时才会走到这里，且必须由用户在弹窗里二次确认。
   */
  const runImport = async () => {
    if (!analysis || analysis.result.issues.length > 0) return
    const members = analysis.result.members
    if (members.length === 0) return

    setImporting(true)
    setImportProgress({ done: 0, total: members.length })
    try {
      const outcomes = await importMemberRows({
        members,
        t,
        onProgress: (done, total) => setImportProgress({ done, total }),
      })
      setImportOutcomes(outcomes)
      setImportOpen(false)
      setResultOpen(true)
      // 导入后清空分析结果，避免同一批数据被重复提交（账号名重复会被后端拒绝，但仍应避免误操作）
      setAnalysis(null)
    } catch (err) {
      // 整批异常（理论上不会，单行失败已在 importMemberRows 内部捕获）
      message.error(extractErrorReason(err, t))
    } finally {
      setImporting(false)
    }
  }

  /** 表头切换控件：选择查看哪一张表（含样表说明） */
  const tableSwitcher = (
    <Segmented<BulkTableKey>
      size="small"
      value={activeTable}
      onChange={setActiveTable}
      options={[
        { value: 'orgs', label: t('bulkMembers.tabOrgs') },
        { value: 'positions', label: t('bulkMembers.tabPositions') },
        { value: 'roles', label: t('bulkMembers.tabRoles') },
        { value: 'template', label: t('bulkMembers.tabTemplate') },
      ]}
    />
  )

  const analysisPassed = analysis !== null && analysis.result.issues.length === 0

  return (
    <div className="bulk-members-view">
      {/* 页头：标题 + 说明 + 操作（固定不滚动） */}
      <section className="panel-card bulk-hero-card">
        <div className="bulk-hero-main">
          <span className="bulk-hero-icon">
            <TeamOutlined />
          </span>
          <div className="bulk-hero-text">
            <h2 className="bulk-hero-title">{t('bulkMembers.title')}</h2>
            <p className="bulk-hero-desc">{t('bulkMembers.desc')}</p>
          </div>
        </div>
        <Space wrap className="bulk-hero-actions">
          <Tooltip title={t('bulkMembers.backHint')}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/portal/${portalKey}/${fromModuleKey}`)}
            >
              {t('bulkMembers.back')}
            </Button>
          </Tooltip>
          <Tooltip title={t('bulkMembers.analyzeHint', { row: BULK_DATA_START_ROW })}>
            <Button icon={<FileSearchOutlined />} loading={analyzing} onClick={pickFile}>
              {t('bulkMembers.analyze')}
            </Button>
          </Tooltip>
          {analysisPassed && (
            <Tooltip title={t('bulkMembers.startImportHint', { n: analysis.result.total })}>
              <Button
                type="primary"
                className="bulk-start-import"
                icon={<ImportOutlined />}
                onClick={() => setImportOpen(true)}
              >
                {t('bulkMembers.startImport')}
              </Button>
            </Tooltip>
          )}
          <Tooltip title={t('bulkMembers.downloadHint')}>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={lookupLoading}
              disabled={lookupLoading}
              onClick={downloadTemplate}
            >
              {t('bulkMembers.download')}
            </Button>
          </Tooltip>
        </Space>
      </section>

      {/* 只有一张表格：表头切换组织 / 身份 / 角色 / 样表说明 */}
      {activeTable === 'orgs' && (
        <LookupTableCard<OrganizationInfo>
          className="bulk-lookup-main"
          switcher={tableSwitcher}
          hint={t('bulkMembers.orgHint')}
          columns={orgColumns}
          rows={orgs}
          rowKey={(row) => row.id}
          loading={orgsLoading}
          error={orgsError}
          searchPlaceholder={t('bulkMembers.searchOrg')}
          filter={filterOrg}
          onRetry={() => void loadOrgs(true)}
          extra={
            <LookupRefreshButton
              hint={t('bulkMembers.refreshHint')}
              onRefresh={() => void loadOrgs(true)}
            />
          }
        />
      )}
      {activeTable === 'positions' && (
        <LookupTableCard<PositionDetail>
          className="bulk-lookup-main"
          switcher={tableSwitcher}
          hint={t('bulkMembers.posHint')}
          columns={positionColumns}
          rows={positions}
          rowKey={(row) => row.code}
          loading={positionsLoading}
          error={positionsError}
          searchPlaceholder={t('bulkMembers.searchPos')}
          filter={filterPosition}
          onRetry={() => void loadPositions(true)}
          extra={
            <LookupRefreshButton
              hint={t('bulkMembers.refreshHint')}
              onRefresh={() => void loadPositions(true)}
            />
          }
        />
      )}
      {activeTable === 'roles' && (
        <LookupTableCard<RoleInfo>
          className="bulk-lookup-main"
          switcher={tableSwitcher}
          hint={t('bulkMembers.roleHint')}
          columns={roleColumns}
          rows={roles}
          rowKey={(row) => row.id}
          loading={rolesLoading}
          error={rolesError}
          searchPlaceholder={t('bulkMembers.searchRole')}
          filter={filterRole}
          onRetry={() => void loadRoles(true)}
          extra={
            <LookupRefreshButton
              hint={t('bulkMembers.refreshHint')}
              onRefresh={() => void loadRoles(true)}
            />
          }
        />
      )}
      {activeTable === 'template' && (
        <LookupTableCard<TemplateColumnRow>
          className="bulk-lookup-main"
          switcher={tableSwitcher}
          hint={t('bulkMembers.sampleHint')}
          count={templateRows.length}
          columns={templateColumns}
          rows={templateRows}
          rowKey={(row) => row.key}
          searchable={false}
          searchPlaceholder=""
          filter={filterTemplate}
          banner={
            <ul className="bulk-rule-bar">
              <li>
                <InfoCircleOutlined className="bulk-rule-icon" />
                {t('bulkMembers.ruleBarOrg', { example: BULK_ORG_IDENTITY_EXAMPLE })}
              </li>
              <li>
                <InfoCircleOutlined className="bulk-rule-icon" />
                {t('bulkMembers.ruleBarRole', { example: BULK_ROLE_EXAMPLE })}
              </li>
              <li>
                <InfoCircleOutlined className="bulk-rule-icon" />
                {t('bulkMembers.ruleBarDate')}
              </li>
              <li>
                <InfoCircleOutlined className="bulk-rule-icon" />
                {t('bulkMembers.ruleBarRow2')}
              </li>
            </ul>
          }
        />
      )}

      {/* 隐藏的文件选择框：只接受 .xlsx */}
      <input
        ref={fileInputRef}
        type="file"
        accept={BULK_IMPORT_EXTENSION}
        hidden
        onChange={(event) => void handleFileChange(event)}
      />

      {/* 校验问题弹窗：逐行列出问题，可导出报错日志 */}
      <Modal
        open={issueOpen}
        title={t('bulkMembers.issueTitle', { n: analysis?.result.issues.length ?? 0 })}
        width={720}
        onCancel={() => setIssueOpen(false)}
        footer={[
          <Button key="export" icon={<DownloadOutlined />} onClick={exportIssueLog}>
            {t('bulkMembers.exportLog')}
          </Button>,
          <Button key="close" type="primary" onClick={() => setIssueOpen(false)}>
            {t('bulkMembers.close')}
          </Button>,
        ]}
      >
        <p className="bulk-issue-summary">
          {t('bulkMembers.issueSummary', {
            file: analysis?.fileName ?? '',
            total: analysis?.result.total ?? 0,
          })}
        </p>
        <div className="bulk-issue-list">
          {analysis?.result.issues.map((issue, index) => (
            <div className="bulk-issue-item" key={`${issue.row}-${issue.field}-${index}`}>
              {formatIssue(issue)}
            </div>
          ))}
        </div>
      </Modal>

      {/* 开始导入：校验通过后才出现；弹窗二次确认后才真正写库 */}
      <Modal
        open={importOpen}
        title={t('bulkMembers.importTitle')}
        width={560}
        maskClosable={!importing}
        closable={!importing}
        onCancel={() => {
          if (!importing) setImportOpen(false)
        }}
        footer={
          importing
            ? null
            : [
                <Button key="cancel" onClick={() => setImportOpen(false)}>
                  {t('bulkMembers.cancel')}
                </Button>,
                <Button key="ok" type="primary" danger onClick={() => void runImport()}>
                  {t('bulkMembers.importConfirm')}
                </Button>,
              ]
        }
      >
        {importing ? (
          <div className="bulk-import-progress">
            <Progress
              percent={
                importProgress.total === 0
                  ? 0
                  : Math.round((importProgress.done / importProgress.total) * 100)
              }
              status="active"
            />
            <p className="bulk-import-note">
              {t('bulkMembers.importRunning', {
                done: importProgress.done,
                total: importProgress.total,
              })}
            </p>
          </div>
        ) : (
          <>
            <Alert
              type="warning"
              showIcon
              title={t('bulkMembers.importConfirmTitle', { n: analysis?.result.total ?? 0 })}
              description={t('bulkMembers.importConfirmDesc')}
            />
            <ol className="bulk-import-steps">
              <li>{t('bulkMembers.importStep1')}</li>
              <li>{t('bulkMembers.importStep2')}</li>
              <li>{t('bulkMembers.importStep3')}</li>
              <li>{t('bulkMembers.importStep4')}</li>
            </ol>
            <p className="bulk-import-note">{t('bulkMembers.importNote')}</p>
          </>
        )}
      </Modal>

      {/* 导入结果：逐行列出失败 / 部分成功的行 */}
      <Modal
        open={resultOpen}
        title={t('bulkMembers.resultTitle')}
        width={720}
        onCancel={() => setResultOpen(false)}
        footer={
          <Button type="primary" onClick={() => setResultOpen(false)}>
            {t('bulkMembers.close')}
          </Button>
        }
      >
        {importOutcomes && (
          <>
            <Alert
              type={
                importOutcomes.some((item) => item.status !== 'success') ? 'warning' : 'success'
              }
              showIcon
              title={t('bulkMembers.resultSummary', {
                ok: importOutcomes.filter((item) => item.status === 'success').length,
                partial: importOutcomes.filter((item) => item.status === 'partial').length,
                failed: importOutcomes.filter((item) => item.status === 'failed').length,
              })}
            />
            {importOutcomes.some((item) => item.status !== 'success') && (
              <div className="bulk-issue-list">
                {importOutcomes
                  .filter((item) => item.status !== 'success')
                  .map((item) => (
                    <div className="bulk-issue-item" key={`${item.row}-${item.username}`}>
                      {t('bulkMembers.issueLine', {
                        row: item.row,
                        name: item.name || t('bulkMembers.check.unnamed'),
                        message: item.message ?? '',
                      })}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
