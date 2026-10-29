/**
 * 站内通知相关常量（代码要求 7：常量集中管理）。
 * 供顶栏消息通知弹层（PortalNoticeBell）与「我的-消息通知」共用。
 */
import type { NoticeCategory } from '../api/types/notices'

/** 通知分类 → i18n 文案 key */
export const NOTICE_CATEGORY_LABEL_KEYS: Record<NoticeCategory, string> = {
  system: 'notice.categorySystem',
  approval: 'notice.categoryApproval',
  announcement: 'notice.categoryAnnouncement',
}
