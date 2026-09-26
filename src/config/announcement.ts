import dayjs from 'dayjs'
import type {
  AnnouncementListItem,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementType,
} from '../api/types/announcements'

/**
 * 公告相关常量集中定义（代码要求：常量统一放 config/，供列表、详情、发布等视图复用）。
 * 文案走 i18n（announcement.type_* / priority_* / status_*），这里仅放样式与枚举顺序。
 */

/** 公告类型 → Tag 配色（夜间模式下 antd Tag 自动适配） */
export const ANNOUNCEMENT_TYPE_COLOR: Record<AnnouncementType, string> = {
  system: 'geekblue',
  academic: 'blue',
  administration: 'default',
  activity: 'green',
  security: 'orange',
  emergency: 'red',
  exam: 'purple',
  admission: 'cyan',
  library: 'gold',
  career: 'lime',
}

/** 通知等级 → Tag 配色 */
export const ANNOUNCEMENT_PRIORITY_COLOR: Record<AnnouncementPriority, string> = {
  trivial: 'default',
  normal: 'blue',
  high: 'gold',
  urgent: 'orange',
  critical: 'red',
}

/** 公告状态 → Tag 配色 */
export const ANNOUNCEMENT_STATUS_COLOR: Record<AnnouncementStatus, string> = {
  draft: 'default',
  published: 'success',
  withdrawn: 'error',
}

/** 类型枚举顺序（发布表单下拉选项） */
export const ANNOUNCEMENT_TYPES: AnnouncementType[] = [
  'system',
  'academic',
  'administration',
  'activity',
  'security',
  'emergency',
  'exam',
  'admission',
  'library',
  'career',
]

/** 等级枚举顺序（发布表单下拉选项） */
export const ANNOUNCEMENT_PRIORITIES: AnnouncementPriority[] = [
  'trivial',
  'normal',
  'high',
  'urgent',
  'critical',
]

/**
 * 列表展示态：后端原始状态为 draft/published/withdrawn，
 * 学生端只关注「已发布 / 已过期」——expire_time 早于当前时间即视为已过期。
 */
export type AnnouncementDisplayStatus = 'published' | 'expired'

/** 展示态 → Tag 配色 */
export const ANNOUNCEMENT_DISPLAY_STATUS_COLOR: Record<AnnouncementDisplayStatus, string> = {
  published: 'success',
  expired: 'default',
}

/** 计算公告在指定时刻的展示态（now 以毫秒时间戳传入，便于测试与定时刷新） */
export function getAnnouncementDisplayStatus(
  item: Pick<AnnouncementListItem, 'expire_time'>,
  now: number = Date.now(),
): AnnouncementDisplayStatus {
  if (item.expire_time) {
    const expire = dayjs(item.expire_time)
    if (expire.isValid() && expire.valueOf() < now) return 'expired'
  }
  return 'published'
}
