/** 学习模块, 提供本人学分进度、学分目标、课表与学习任务 API（/api/me/learning） */
import { cachedGet, invalidate } from './cache'
import { http } from './http'
import type {
  CreditGoal,
  CreditProgress,
  Schedule,
  ScheduleInput,
  ScheduleQuery,
  TaskInput,
  TaskPage,
  TaskQuery,
} from './types/learning'

// ==================== 学分 ====================

/**
 * GET /api/me/learning/credits 按已通过课程去重汇总本人学分（会话内缓存）。
 * 该结果不代表正式毕业审核。
 * @param force 类型：boolean；默认值：false；是否必填：可选（true 时绕过缓存）
 * @returns 类型：Promise<CreditProgress>
 */
export function getLearningCredits(force?: boolean): Promise<CreditProgress> {
  return cachedGet<CreditProgress>('/me/learning/credits', undefined, { force })
}

/**
 * PUT /api/me/learning/credit-goal 设置个人学分目标，成功返回 204。
 * target_credit 传 null 表示清除目标；该目标并非学校正式毕业要求。
 * @param body 类型：CreditGoal；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function setLearningCreditGoal(body: CreditGoal): Promise<void> {
  await http.put('/me/learning/credit-goal', body)
  invalidate('GET /me/learning/credits')
}

// ==================== 课表 ====================

/**
 * GET /api/me/learning/schedules 查询本人课表（会话内缓存）。
 * @param params 类型：ScheduleQuery；默认值：无；是否必填：必填（semester 必填）
 * @param force 类型：boolean；默认值：false；是否必填：可选（true 时绕过缓存）
 * @returns 类型：Promise<Schedule[]>
 */
export function queryLearningSchedules(
  params: ScheduleQuery,
  force?: boolean,
): Promise<Schedule[]> {
  return cachedGet<Schedule[]>(
    '/me/learning/schedules',
    params as unknown as Record<string, unknown>,
    { force },
  )
}

/**
 * POST /api/me/learning/schedules 新增本人课表条目，成功返回新条目 ID。
 * @param body 类型：ScheduleInput；默认值：无；是否必填：必填
 * @returns 类型：Promise<number>
 */
export async function createLearningSchedule(body: ScheduleInput): Promise<number> {
  const res = await http.post<number>('/me/learning/schedules', body)
  invalidate('GET /me/learning/schedules')
  return res.data
}

/**
 * PUT /api/me/learning/schedules/{id} 全量替换本人课表条目，成功返回 204。
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param body 类型：ScheduleInput；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updateLearningSchedule(
  id: number,
  body: ScheduleInput,
): Promise<void> {
  await http.put(`/me/learning/schedules/${id}`, body)
  invalidate('GET /me/learning/schedules')
}

/**
 * DELETE /api/me/learning/schedules/{id} 删除本人课表条目，成功返回 204。
 * @param id 类型：number；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function deleteLearningSchedule(id: number): Promise<void> {
  await http.delete(`/me/learning/schedules/${id}`)
  invalidate('GET /me/learning/schedules')
}

// ==================== 学习任务 ====================

/**
 * GET /api/me/learning/tasks 按截止时间分页查询本人任务（会话内缓存）。
 * @param params 类型：TaskQuery；默认值：{}；是否必填：可选
 * @param force 类型：boolean；默认值：false；是否必填：可选（true 时绕过缓存）
 * @returns 类型：Promise<TaskPage>
 */
export function queryLearningTasks(
  params: TaskQuery = {},
  force?: boolean,
): Promise<TaskPage> {
  return cachedGet<TaskPage>(
    '/me/learning/tasks',
    params as Record<string, unknown>,
    { force },
  )
}

/**
 * POST /api/me/learning/tasks 新增本人任务，成功返回新任务 ID。
 * @param body 类型：TaskInput；默认值：无；是否必填：必填
 * @returns 类型：Promise<number>
 */
export async function createLearningTask(body: TaskInput): Promise<number> {
  const res = await http.post<number>('/me/learning/tasks', body)
  invalidate('GET /me/learning/tasks')
  return res.data
}

/**
 * PUT /api/me/learning/tasks/{id} 全量替换本人任务（可通过 completed 完成或重新打开），成功返回 204。
 * @param id 类型：number；默认值：无；是否必填：必填
 * @param body 类型：TaskInput；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function updateLearningTask(id: number, body: TaskInput): Promise<void> {
  await http.put(`/me/learning/tasks/${id}`, body)
  invalidate('GET /me/learning/tasks')
}

/**
 * DELETE /api/me/learning/tasks/{id} 删除本人任务，成功返回 204。
 * @param id 类型：number；默认值：无；是否必填：必填
 * @returns 类型：Promise<void>
 */
export async function deleteLearningTask(id: number): Promise<void> {
  await http.delete(`/me/learning/tasks/${id}`)
  invalidate('GET /me/learning/tasks')
}
