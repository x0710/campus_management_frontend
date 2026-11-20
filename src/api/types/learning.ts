/**
 * 学习模块类型定义：学分进度/目标、课表条目与学习任务。
 *
 * 对应后端 /api/me/learning 系列接口（均仅操作当前登录用户本人数据）：
 *   GET  /api/me/learning/credits             按已通过课程去重汇总学分
 *   PUT  /api/me/learning/credit-goal         设置/清除个人学分目标
 *   GET  /api/me/learning/schedules           按学期（可选日期）查询课表
 *   POST /api/me/learning/schedules           新增课表条目
 *   PUT  /api/me/learning/schedules/{id}      全量替换课表条目
 *   DELETE /api/me/learning/schedules/{id}    删除课表条目
 *   GET  /api/me/learning/tasks               按截止时间分页查询任务
 *   POST /api/me/learning/tasks               新增任务
 *   PUT  /api/me/learning/tasks/{id}          全量替换任务（含完成/重新打开）
 *   DELETE /api/me/learning/tasks/{id}        删除任务
 *
 * 学分字段为后端 DecimalText（JSON 字符串，如 "3.00"），前端按字符串透传；
 * 时间字段：DateTime 为 RFC3339 字符串，任务的 due_at 为 Unix 秒（int64）。
 */
import type { PageQuery } from './common'

/** 学分分类汇总（api.json: CreditCategory） */
export interface CreditCategory {
  /** 课程类型（如 compulsory / elective / general） */
  course_type: string
  /** 该类型已获得学分（DecimalText 字符串） */
  earned_credit: string
  /** 该类型已通过课程数 */
  passed_courses: number
}

/** 学分进度（api.json: CreditProgress） */
export interface CreditProgress {
  /** 已获得总学分（DecimalText 字符串） */
  earned_credit: string
  /** 个人目标学分（未设置时为 null） */
  target_credit: string | null
  /** 距离目标剩余学分（未设置目标时为 null） */
  remaining_credit: string | null
  /** 按课程类型拆分的学分汇总 */
  categories: CreditCategory[]
}

/** PUT /api/me/learning/credit-goal 请求体（api.json: CreditGoal；target_credit 传 null 清除目标） */
export interface CreditGoal {
  target_credit: string | null
}

/** 课表条目输入（api.json: ScheduleInput） */
export interface ScheduleInput {
  /** 学期标识，如 "2025-2026-1" */
  semester: string
  course_name: string
  location: string
  /** 第一教学周的周一，YYYY-MM-DD；时间表使用校园本地时间 */
  term_start: string
  /** 周一为 1，周日为 7 */
  weekday: number
  /** 起始教学周 */
  start_week: number
  /** 结束教学周 */
  end_week: number
  /** 单双周模式：all / odd / even，按教学周编号判断 */
  week_pattern: string
  /** 开始时间：从零点起的分钟数 */
  start_minute: number
  /** 结束时间：从零点起的分钟数 */
  end_minute: number
}

/** 课表条目（api.json: Schedule） */
export interface Schedule extends ScheduleInput {
  /** 课表条目 ID */
  id: number
}

/** GET /api/me/learning/schedules 查询参数 */
export interface ScheduleQuery {
  /** 学期标识（必填） */
  semester: string
  /** 仅返回指定日期上课的条目，YYYY-MM-DD（可选） */
  date?: string | null
}

/** 学习任务输入（api.json: TaskInput） */
export interface TaskInput {
  title: string
  course_name: string
  /** 任务类型：assignment / exam / review */
  kind: string
  /** 截止时刻，Unix 秒；前端按用户时区显示 */
  due_at: number
  /** 是否已完成 */
  completed: boolean
  notes: string
}

/** 学习任务（api.json: LearningTask） */
export interface LearningTask extends TaskInput {
  id: number
}

/** 任务分页响应（api.json: TaskPage；无 page/page_size/total_pages，仅 data 与 total） */
export interface TaskPage {
  data: LearningTask[]
  total: number
}

/** GET /api/me/learning/tasks 查询参数 */
export interface TaskQuery extends PageQuery {
  /** 按完成状态筛选（可选，不传查询全部） */
  completed?: boolean
}
