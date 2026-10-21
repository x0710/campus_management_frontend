/**
 * 组织概览 / 成员详情相关常量（代码要求 7：常量集中放 config/）。
 * - 组织概览页的成员列表每页条数（领导端「组织概览」与老师端「班级管理」共用组件）
 * - 成员详情页内各列表（成绩/请假/违规）每页条数
 * - 成员详情页「只读来源」模块清单（领导端可编辑，老师端仅查询）
 * 分页均取 100，满足 代码要求 12：表格每页最多 100 行。
 */

/** 组织概览：组织成员表每页条数 */
export const LEADER_ORG_MEMBER_PAGE_SIZE = 100

/** 成员详情页：成绩 / 请假 / 违规列表每页条数 */
export const MEMBER_DETAIL_PAGE_SIZE = 100

/**
 * 成员详情页的「只读来源」模块 key：
 * 从这些模块（老师端班级管理 teacher_m3、党委支部端支部管理 branch_m5、
 * 党委学院端学院支部管理 academy_m5）进入成员详情时隐藏成绩/违规编辑入口，
 * 这些入口只做成员信息查询，避免展示无权限的编辑按钮。
 */
export const MEMBER_DETAIL_READONLY_FROM_MODULES: string[] = [
  'teacher_m3',
  'branch_m5',
  'academy_m5',
]

/**
 * 成员详情页「基本信息」可编辑的来源模块 key：
 * 管理端组织架构（admin_m3）与党委学校端组织管理（school_m2）具备用户资料、
 * 角色与组织任职的修改权限，从这些来源进入成员详情时在「基本信息」页展示
 * 「编辑基本信息 / 编辑系统角色 / 编辑组织任职」三个独立入口（复用 admin/UserEditPanel，
 * 每个入口只编辑一个区块）；
 * 领导端 leader_m3 等只查看的来源不展示，避免出现越权的操作按钮。
 */
export const MEMBER_DETAIL_BASIC_EDIT_FROM_MODULES: string[] = [
  'admin_m3',
  'school_m2',
]

/**
 * 成员详情页隐藏「请假 / 违规信息 / 奖学金及补助」三个 Tab 的来源模块 key：
 * 党委支部端支部管理 branch_m5、党委学院端学院支部管理 academy_m5、
 * 党委学校端组织管理 school_m2 的组织管理只关注成员基础资料与成绩，
 * 不需要这三块业务数据，因此从这些来源进入成员详情时不展示对应 Tab。
 */
export const MEMBER_DETAIL_HIDDEN_EXTRA_TABS_FROM_MODULES: string[] = [
  'branch_m5',
  'academy_m5',
  'school_m2',
]
