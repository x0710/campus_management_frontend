/** 成员详情 - 成绩页签：成绩查询、录入与编辑。 */

import { isEntryActionTarget } from '../../../utils/entryInteraction'
import { useRequestSequence } from '../../../composables/useRequestSequence'
import { EditOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractErrorReason } from '../../../api/common'
import { getScore, listAllScoresForUser, updateScore } from '../../../api/examinations'
import type { CourseScoreInfo, ExamType } from '../../../api/types/examinations'
import { useCourseDetails } from '../../../composables/useCourseNames'
import { useErrorFeedback } from '../../../composables/useErrorFeedback'
import { EXAM_TYPE_COLOR, EXAM_TYPE_ORDER, scoreColor } from '../../../config/examination'
import { MEMBER_DETAIL_PAGE_SIZE } from '../../../config/leaderOrg'
import { type TranslateFn } from '../../../i18n'
import { formatPaginationTotal } from '../../../utils/pagination'
import ErrorState from '../../../components/ErrorState'

/** 成绩编辑表单值 */
interface ScoreFormValues {
  score: number
  is_pass: boolean
  exam_type: ExamType
  remark?: string
}

/**
 * 成绩信息 Tab：展示成员全部成绩，双击行编辑（PATCH /api/examinations/{id}）。
 * readOnly=true（如老师端班级管理进入）时隐藏编辑入口与行点击编辑，仅作查询（代码要求 14）。
 * @param { uid, t, readOnly } 类型：{ uid: number; t: TranslateFn; readOnly: boolean }；默认值：无；是否必填：必填
 * @returns 类型：Element
 */
export default function GradesTab({ uid, t, readOnly }: { uid: number; t: TranslateFn; readOnly: boolean }) {
  const { message } = AntdApp.useApp()
  const reportError = useErrorFeedback()

  const [scores, setScores] = useState<CourseScoreInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState({ seq: 0, force: false })

  const courseDetails = useCourseDetails(
    useMemo(() => scores.map((s) => s.course_id), [scores]),
  )

  const [editTarget, setEditTarget] = useState<CourseScoreInfo | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<ScoreFormValues>()

  const requests = useRequestSequence()
  const load = useCallback(async () => {
    const isCurrent = requests.begin()
    setLoading(true)
    setError(null)
    try {
      const scores = await listAllScoresForUser(uid, reload.force)
      if (!isCurrent()) return
      setScores(scores)
    } catch (err) {
      if (isCurrent() && !(axios.isAxiosError(err) && err.response?.status === 401)) {
        setError(extractErrorReason(err, t))
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [uid, reload.force, t, requests])

  useEffect(() => {
    void load()
    return () => requests.invalidate()
  }, [load, requests, reload.seq])

  /** 打开编辑弹窗：先用列表项回填（弹窗立即打开），再取成绩详情补齐备注 */
  const openEdit = useCallback(
    async (record: CourseScoreInfo) => {
      setEditTarget(record)
      form.setFieldsValue({
        score: Number(record.score),
        is_pass: record.is_pass,
        exam_type: record.exam_type,
        remark: '',
      })
      setEditLoading(true)
      try {
        const detail = await getScore(record.id, true)
        setEditTarget(detail)
        form.setFieldsValue({
          score: Number(detail.score),
          is_pass: detail.is_pass,
          exam_type: detail.exam_type,
          remark: detail.remark,
        })
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 401)) {
          reportError(err)
        }
        setEditTarget(null)
      } finally {
        setEditLoading(false)
      }
    },
    [form, reportError],
  )

  const submit = async () => {
    const values = await form.validateFields()
    if (!editTarget) return
    setSaving(true)
    try {
      await updateScore(editTarget.id, {
        score: String(values.score),
        is_pass: values.is_pass,
        exam_type: values.exam_type,
        remark: values.remark ?? '',
      })
      message.success(t('memberDetail.scoreUpdateSuccess'))
      setEditTarget(null)
      // 保存后强制刷新，展示最新成绩（代码要求 13）
      setReload((r) => ({ seq: r.seq + 1, force: true }))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      reportError(err)
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ColumnsType<CourseScoreInfo>>(() => {
    const cols: ColumnsType<CourseScoreInfo> = [
      {
        title: t('teacherGrades.colCourse'),
        dataIndex: 'course_id',
        key: 'course_id',
        width: 200,
        ellipsis: true,
        render: (id: number) => {
          if (!courseDetails.has(id)) return t('common.loading')
          const name = courseDetails.get(id)?.course_name
          return <span title={name ?? undefined}>{name ?? `#${id}`}</span>
        },
      },
      {
        title: t('teacherGrades.colSemester'),
        dataIndex: 'semester',
        key: 'semester',
        width: 200,
        render: (v: string) => <span title={v}>{v}</span>,
      },
      {
        title: t('teacherGrades.colExamType'),
        dataIndex: 'exam_type',
        key: 'exam_type',
        width: 110,
        render: (v: ExamType) => (
          <Tag color={EXAM_TYPE_COLOR[v]}>{t(`teacherGrades.examType_${v}`)}</Tag>
        ),
      },
      {
        title: t('teacherGrades.colScore'),
        dataIndex: 'score',
        key: 'score',
        width: 100,
        align: 'center',
        render: (v: string, record) => (
          <span style={{ fontWeight: 600, color: scoreColor(v, record.is_pass) }}>{v}</span>
        ),
      },
      {
        title: t('teacherGrades.colPass'),
        dataIndex: 'is_pass',
        key: 'is_pass',
        width: 110,
        align: 'center',
        render: (v: boolean) => (
          <Tag color={v ? 'green' : 'red'}>
            {t(v ? 'teacherGrades.pass' : 'teacherGrades.fail')}
          </Tag>
        ),
      },
      ]
    // 只读来源（老师端班级管理）不展示成绩编辑入口
    if (!readOnly) {
      cols.push({
        title: t('approval.colAction'),
        key: 'action',
        width: 100,
        render: (_: unknown, record: CourseScoreInfo) => (
          <Tooltip title={t('memberDetail.scoreEditHint')}>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => void openEdit(record)}
            >
              {t('memberDetail.edit')}
            </Button>
          </Tooltip>
        ),
      })
    }
    return cols
  }, [t, courseDetails, openEdit, readOnly])

  return (
    <>
      <div className="approval-toolbar approval-toolbar-right" style={{ marginBottom: 12 }}>
        <Tooltip title={t('memberDetail.gradesRefreshHint')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
          >
            {t('common.refresh')}
          </Button>
        </Tooltip>
      </div>

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => setReload((r) => ({ seq: r.seq + 1, force: true }))}
        />
      ) : (
        <Table<CourseScoreInfo>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={scores}
          locale={{ emptyText: t('common.noData') }}
          scroll={{ x: 900 }}
          /* 只读来源不响应行点击编辑（老师端仅查询） */
          onRow={
            readOnly
              ? undefined
              : (record) => ({
                  onDoubleClick: (e: React.MouseEvent) => {
                    if (isEntryActionTarget(e.target)) return
                    const target = e.target as HTMLElement
                    if (target.closest('button')) return
                    void openEdit(record)
                  },
                  title: t('memberDetail.scoreEditHint'),
                  style: { cursor: 'pointer' },
                })
          }
          pagination={{
            current: page,
            pageSize: MEMBER_DETAIL_PAGE_SIZE,
            total: scores.length,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (n: number) => formatPaginationTotal(t, n, MEMBER_DETAIL_PAGE_SIZE),
            onChange: (p: number) => setPage(p),
          }}
        />
      )}

      <Modal
        open={editTarget !== null}
        title={t('memberDetail.editScore')}
        okText={t('memberDetail.save')}
        cancelText={t('approval.cancel')}
        confirmLoading={saving}
        onCancel={() => setEditTarget(null)}
        onOk={() => void submit()}
        destroyOnHidden
      >
        <Spin spinning={editLoading}>
          {editTarget && (
            <Descriptions
              size="small"
              column={1}
              style={{ marginBottom: 12 }}
              items={[
                {
                  key: 'course',
                  label: t('teacherGrades.colCourse'),
                  children:
                    courseDetails.get(editTarget.course_id)?.course_name ??
                    `#${editTarget.course_id}`,
                },
                {
                  key: 'semester',
                  label: t('teacherGrades.colSemester'),
                  children: editTarget.semester,
                },
              ]}
            />
          )}
          <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item
              name="score"
              label={t('memberDetail.fieldScore')}
              rules={[
                { required: true, message: t('memberDetail.scoreRequired') },
                {
                  type: 'number',
                  min: 0,
                  max: 100,
                  message: t('memberDetail.scoreRange'),
                },
              ]}
            >
              <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="is_pass" label={t('memberDetail.fieldIsPass')} valuePropName="checked">
              <Switch
                checkedChildren={t('teacherGrades.pass')}
                unCheckedChildren={t('teacherGrades.fail')}
              />
            </Form.Item>
            <Form.Item name="exam_type" label={t('memberDetail.fieldExamType')}>
              <Select
                options={EXAM_TYPE_ORDER.map((v) => ({
                  value: v,
                  label: t(`teacherGrades.examType_${v}`),
                }))}
              />
            </Form.Item>
            <Form.Item name="remark" label={t('memberDetail.fieldRemark')}>
              <Input.TextArea rows={3} maxLength={500} showCount />
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </>
  )
}
