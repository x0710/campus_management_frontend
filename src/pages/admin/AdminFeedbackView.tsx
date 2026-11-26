import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, InboxOutlined, PlusOutlined, QrcodeOutlined, ReloadOutlined } from '@ant-design/icons'
import { App, Button, Dropdown, Empty, Input, Pagination, Popover, Select, Spin, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { extractErrorReason } from '../../api/common'
import { deleteFeedback, queryFeedbacks } from '../../api/feedbacks'
import type { CreatedDateQuery } from '../../api/types/common'
import type { FeedbackCategory, FeedbackDto } from '../../api/types/feedbacks'
import CreatedDateFilter from '../../components/CreatedDateFilter'
import ErrorState from '../../components/ErrorState'
import FeedbackFormModal from '../../components/FeedbackFormModal'
import { useErrorFeedback } from '../../composables/useErrorFeedback'
import { useRequestSequence } from '../../composables/useRequestSequence'
import { useUserNames } from '../../composables/useUserNames'
import { FEEDBACK_CATEGORY_COLOR, FEEDBACK_CATEGORY_ORDER, FEEDBACK_PAGE_SIZE, getFeedbackCategoryLabel } from '../../config/feedback'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { formatDateTime } from '../../utils/datetime'
import './AdminFeedbackView.css'

export default function AdminFeedbackView() {
  const t = useT()
  const locale = useSettingsStore((state) => state.locale)
  const { modal, message } = App.useApp()
  const reportError = useErrorFeedback()
  const requests = useRequestSequence()
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<FeedbackCategory>()
  const [dates, setDates] = useState<CreatedDateQuery>({})
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [rows, setRows] = useState<FeedbackDto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, select] = useState<number | null>(null)
  const [reading, setReading] = useState(false)
  const [form, setForm] = useState<'create' | number | null>(null)
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0]
  const names = useUserNames(rows.map((row) => row.user_id))
  const reload = () => setRefresh((version) => version + 1)

  useEffect(() => {
    const current = requests.begin()
    setLoading(true)
    setError('')
    void queryFeedbacks({ page, page_size: FEEDBACK_PAGE_SIZE, ...dates, category, keyword: keyword || undefined }, refresh > 0)
      .then((result) => {
        if (!current()) return
        const lastPage = Math.max(1, Math.ceil(result.total / FEEDBACK_PAGE_SIZE))
        if (page > lastPage) { setPage(lastPage); return }
        setRows(result.data)
        setTotal(result.total)
      })
      .catch((err) => { if (current()) setError(extractErrorReason(err, t)) })
      .finally(() => { if (current()) setLoading(false) })
    return requests.invalidate
  }, [page, keyword, category, dates, refresh, requests, t])

  function resetSelection() {
    select(null)
    setReading(false)
    setPage(1)
  }

  function confirmDelete(row: FeedbackDto) {
    modal.confirm({
      title: t('feedback.deleteConfirm'), content: row.title, okText: t('feedback.delete'), okType: 'danger',
      onOk: async () => {
        try {
          await deleteFeedback(row.id)
          message.success(t('feedback.deleteSuccess'))
          setReading(false)
          reload()
        } catch (err) { reportError(err) }
      },
    })
  }

  const tag = (row: FeedbackDto) => <Tag color={FEEDBACK_CATEGORY_COLOR[row.category]}>{getFeedbackCategoryLabel(row.category, t)}</Tag>

  return <section className="feedback-inbox panel-card">
    <header className="feedback-inbox-header">
      <div className="feedback-inbox-heading"><InboxOutlined /><h2>{t('feedback.inbox')}</h2></div>
      <div className="feedback-inbox-actions">
        <Popover trigger="click" title={t('feedback.contactImageAlt')} content={<img className="feedback-inbox-qr" src={`${import.meta.env.BASE_URL}mmexport1793304431141.jpg`} alt={t('feedback.contactImageAlt')} />}>
          <Button icon={<QrcodeOutlined />} aria-label={t('feedback.contactImageAlt')} title={t('feedback.contactImageAlt')} />
        </Popover>
        <Button icon={<ReloadOutlined />} loading={loading} aria-label={t('common.refresh')} title={t('common.refresh')} onClick={reload} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm('create')}>{t('feedback.createTitle')}</Button>
      </div>
    </header>
    <div className="feedback-inbox-filters">
      <Input.Search allowClear placeholder={t('feedback.searchPlaceholder')} aria-label={t('feedback.searchPlaceholder')}
        onSearch={(value) => { resetSelection(); setKeyword(value.trim()) }} />
      <Select allowClear value={category} placeholder={t('feedback.allCategories')} aria-label={t('feedback.fieldCategory')}
        options={FEEDBACK_CATEGORY_ORDER.map((value) => ({ value, label: getFeedbackCategoryLabel(value, t) }))}
        onChange={(value) => { resetSelection(); setCategory(value) }} />
      <CreatedDateFilter value={dates} onChange={(value) => { resetSelection(); setDates(value) }} />
    </div>
    {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <div className="feedback-inbox-state"><Spin /></div> :
      !selected ? <div className="feedback-inbox-state"><Empty description={t('feedback.emptyInbox')} /></div> :
      <div className="feedback-inbox-panes" data-reading={reading}>
        <section className="feedback-inbox-list">
          <div className="feedback-inbox-count">{t('feedback.results', { n: total })}</div>
          <div className="feedback-inbox-items">
            {rows.map((row) => <button type="button" key={row.id} aria-current={row.id === selected.id} className="feedback-inbox-item"
              onClick={() => { select(row.id); setReading(true) }}>
              <span className="feedback-inbox-row-meta">{tag(row)}<time dateTime={row.created_at}>{formatDateTime(row.created_at, locale)}</time></span>
              <strong>{row.title}</strong><span className="feedback-inbox-excerpt">{row.content}</span>
            </button>)}
          </div>
          {total > FEEDBACK_PAGE_SIZE && <Pagination simple={{ readOnly: true }} current={page} total={total} pageSize={FEEDBACK_PAGE_SIZE} showSizeChanger={false}
            onChange={(value) => { setReading(false); select(null); setPage(value) }} />}
        </section>
        <article className="feedback-inbox-reader" key={selected.id}>
          <Button type="text" className="feedback-inbox-back" icon={<ArrowLeftOutlined />} onClick={() => setReading(false)}>{t('feedback.backToList')}</Button>
          <div className="feedback-inbox-reader-top"><span>{tag(selected)} <small>#{selected.id}</small></span>
            <Dropdown trigger={['click']} menu={{ items: [
              { key: 'edit', icon: <EditOutlined />, label: t('feedback.edit'), onClick: () => setForm(selected.id) },
              { key: 'delete', danger: true, icon: <DeleteOutlined />, label: t('feedback.delete'), onClick: () => confirmDelete(selected) },
            ] }}><Button size="small">{t('feedback.colActions')} ▾</Button></Dropdown>
          </div>
          <h3>{selected.title}</h3>
          <dl className="feedback-inbox-metadata">
            <dt>{t('feedback.sender')}</dt><dd>{names.get(selected.user_id) ? `${names.get(selected.user_id)} · ` : ''}UID {selected.user_id}</dd>
            <dt>{t('feedback.createdAt')}</dt><dd>{formatDateTime(selected.created_at, locale)}</dd>
            {selected.updated_at !== selected.created_at && <><dt>{t('feedback.updatedAt')}</dt><dd>{formatDateTime(selected.updated_at, locale)}</dd></>}
            <dt>{t('feedback.contact')}</dt><dd>{selected.contact ? <Typography.Text copyable>{selected.contact}</Typography.Text> : '—'}</dd>
          </dl>
          <p className="feedback-inbox-content">{selected.content}</p>
        </article>
      </div>}
    <FeedbackFormModal open={form !== null} mode={typeof form === 'number' ? 'edit' : 'create'} feedbackId={typeof form === 'number' ? form : undefined}
      onCancel={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />
  </section>
}
