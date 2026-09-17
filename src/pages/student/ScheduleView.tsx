import { Alert, Select, Space } from 'antd'
import { useMemo, useState } from 'react'
import { useT } from '../../i18n'

/**
 * 学生端：我的课表（周课表网格，11 节次 × 7 天）。
 * 注意：当前为【模拟数据预览页】，后端尚无课表接口。
 * 接口就绪后：把 MOCK_EVENTS 替换为 src/api/ 中的请求（useEffect 拉取），
 * 网格渲染逻辑无需改动。
 */

/** 课程颜色调色板（与 i18n course key 对应）；同一门课一周多次出现颜色一致 */
const COURSE_COLORS: Record<string, string> = {
  course_math: '#2f54eb',
  course_english: '#0fa968',
  course_physics: '#722ed1',
  course_pe: '#fa8c16',
  course_data: '#13c2c2',
  course_politics: '#d4380d',
  course_program: '#eb2f96',
  course_lab: '#faad14',
  course_situation: '#7cb305',
  course_listening: '#08979c',
  course_training: '#f5222d',
  course_classmeeting: '#8c8c8c',
  course_music: '#9254de',
  course_elective: '#c41d7f',
}

interface MockCourseEvent {
  /** 星期：0=周一 … 6=周日 */
  day: number
  /** 起始节次：0=第 1 节 … 10=第 11 节 */
  startSlot: number
  /** 连续占用节数：少部分课 1 节，多数 2 节，部分连上 3 节 */
  duration: 1 | 2 | 3
  /** 对应 i18n 文案 schedule.${nameKey}，同时用于取色 */
  nameKey: string
  /** 教师姓名（模拟数据使用拼音，无需翻译） */
  teacher: string
  room: string
}

/**
 * 一周课程事件（模拟数据）。
 * 同一门课在不同天是多条事件，颜色按 nameKey 保持一致；
 * 连续多节的课只有一条事件，渲染时纵向合并为一个色块。
 */
const MOCK_EVENTS: MockCourseEvent[] = [
  // 周一：高数 1-2、数据结构 3-4、物理实验 6-8（三连）
  { day: 0, startSlot: 0, duration: 2, nameKey: 'course_math', teacher: 'Wang Fang', room: 'A301' },
  { day: 0, startSlot: 2, duration: 2, nameKey: 'course_data', teacher: 'Chen Jing', room: 'Lab Bldg 401' },
  { day: 0, startSlot: 5, duration: 3, nameKey: 'course_lab', teacher: 'Zhao Qiang', room: 'Physics Lab 201' },
  // 周二：英语 1-2、物理 3-4、形势与政策 5（单节）、程序设计实践 6-7
  { day: 1, startSlot: 0, duration: 2, nameKey: 'course_english', teacher: 'Li Lei', room: 'B202' },
  { day: 1, startSlot: 2, duration: 2, nameKey: 'course_physics', teacher: 'Zhao Qiang', room: 'A205' },
  { day: 1, startSlot: 4, duration: 1, nameKey: 'course_situation', teacher: 'Zhang Min', room: 'C105' },
  { day: 1, startSlot: 5, duration: 2, nameKey: 'course_program', teacher: 'Liu Yang', room: 'Computer Rm 3' },
  // 周三：思政 1-2、数据结构 3-4、英语听说 5（单节）、创新创业实训 6-8（三连）
  { day: 2, startSlot: 0, duration: 2, nameKey: 'course_politics', teacher: 'Zhang Min', room: 'C105' },
  { day: 2, startSlot: 2, duration: 2, nameKey: 'course_data', teacher: 'Chen Jing', room: 'Lab Bldg 401' },
  { day: 2, startSlot: 4, duration: 1, nameKey: 'course_listening', teacher: 'Li Lei', room: 'Language Lab 1' },
  { day: 2, startSlot: 5, duration: 3, nameKey: 'course_training', teacher: 'Liu Yang', room: 'Innovation Base' },
  // 周四：高数 1-2、物理 3-4、体育 6-7、班会 8（单节）
  { day: 3, startSlot: 0, duration: 2, nameKey: 'course_math', teacher: 'Wang Fang', room: 'A301' },
  { day: 3, startSlot: 2, duration: 2, nameKey: 'course_physics', teacher: 'Zhao Qiang', room: 'A205' },
  { day: 3, startSlot: 5, duration: 2, nameKey: 'course_pe', teacher: 'Guo Tao', room: 'Playground' },
  { day: 3, startSlot: 7, duration: 1, nameKey: 'course_classmeeting', teacher: 'Class 2301', room: 'A301' },
  // 周五：英语 1-2、程序设计实践 3-4、音乐鉴赏 6（单节）
  { day: 4, startSlot: 0, duration: 2, nameKey: 'course_english', teacher: 'Li Lei', room: 'B202' },
  { day: 4, startSlot: 2, duration: 2, nameKey: 'course_program', teacher: 'Liu Yang', room: 'Computer Rm 3' },
  { day: 4, startSlot: 5, duration: 1, nameKey: 'course_music', teacher: 'He Xiao', room: 'Arts Bldg 208' },
  // 周六：通识选修 1-3（三连），其余无课
  { day: 5, startSlot: 0, duration: 3, nameKey: 'course_elective', teacher: 'Yang Bo', room: 'Auditorium' },
  // 周日：无课（整列留空）
]

const DAY_COUNT = 7
const SLOT_COUNT = 11

export default function ScheduleView() {
  const t = useT()
  const [term, setTerm] = useState('term_1')
  const [week, setWeek] = useState(3)

  // 周一至周日表头
  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, i) => t(`schedule.day_${i + 1}`)),
    [t],
  )
  const weekOptions = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        value: i + 1,
        label: t('schedule.weekValue', { n: i + 1 }),
      })),
    [t],
  )
  // 背景空格：11 节 × 7 天，负责网格线；课程块作为覆盖层浮在其上
  const backgroundCells = useMemo(
    () =>
      Array.from({ length: SLOT_COUNT * DAY_COUNT }, (_, idx) => ({
        key: `cell-${idx}`,
        // grid 行/列从 2 起算（第 1 行/列是表头与节次）
        row: Math.floor(idx / DAY_COUNT) + 2,
        column: (idx % DAY_COUNT) + 2,
      })),
    [],
  )

  return (
    <section className="panel-card" style={{ width: '100%', maxWidth: 'unset' }}>
      <header className="panel-card-header">
        <h3 className="panel-card-title">{t('schedule.title')}</h3>
        <Space wrap>
          <Select
            size="small"
            value={term}
            onChange={setTerm}
            style={{ width: 200 }}
            options={[
              { value: 'term_1', label: t('grades.term_1') },
              { value: 'term_2', label: t('grades.term_2') },
            ]}
          />
          <Select
            size="small"
            value={week}
            onChange={setWeek}
            style={{ width: 110 }}
            options={weekOptions}
          />
        </Space>
      </header>
      <div className="panel-card-body">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert type="warning" showIcon title={t('common.mockHint')} />

          <div className="schedule-grid-wrap">
            <div className="schedule-grid">
              {/* ===== 背景层：角格、星期表头、节次、空格 ===== */}
              <div className="schedule-grid-corner" style={{ gridColumn: 1, gridRow: 1 }}>
                {t('schedule.week')}
              </div>
              {days.map((day, dayIdx) => (
                <div
                  key={day}
                  className="schedule-grid-head"
                  style={{ gridColumn: dayIdx + 2, gridRow: 1 }}
                >
                  {day}
                </div>
              ))}
              {Array.from({ length: SLOT_COUNT }, (_, slotIdx) => (
                <div
                  key={`slot-${slotIdx}`}
                  className="schedule-grid-slot"
                  style={{ gridColumn: 1, gridRow: slotIdx + 2 }}
                >
                  {t('schedule.slotValue', { n: slotIdx + 1 })}
                </div>
              ))}
              {backgroundCells.map((cell) => (
                <div
                  key={cell.key}
                  className="schedule-cell"
                  style={{ gridColumn: cell.column, gridRow: cell.row }}
                />
              ))}

              {/* ===== 课程层：连续多节的事件用一个块纵向贯通，信息只显示一次 ===== */}
              {MOCK_EVENTS.map((ev) => {
                const color = COURSE_COLORS[ev.nameKey]
                return (
                  <div
                    key={`${ev.day}-${ev.startSlot}-${ev.nameKey}`}
                    className="schedule-course"
                    style={{
                      gridColumn: ev.day + 2,
                      gridRow: `${ev.startSlot + 2} / span ${ev.duration}`,
                      borderColor: color,
                      background: `${color}1A`,
                      color,
                    }}
                  >
                    <div className="schedule-course-name">{t(`schedule.${ev.nameKey}`)}</div>
                    {/* 单节块空间有限，只显示教室；两节及以上显示教师+教室 */}
                    {ev.duration > 1 && (
                      <div className="schedule-course-meta">{ev.teacher}</div>
                    )}
                    <div className="schedule-course-meta">{ev.room}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </Space>
      </div>
    </section>
  )
}
