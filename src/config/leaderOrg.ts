/**
 * 组织概览 / 成员详情相关常量（代码要求 7：常量集中放 config/）。
 * - 组织概览页的成员列表每页条数（领导端「组织概览」与老师端「班级管理」共用组件）
 * - 成员详情页内各列表（成绩/请假/违规）每页条数
 * - 成员详情页「只读来源」模块清单（领导端可编辑，老师端仅查询）
 * 分页均取 20，满足 代码要求 12：表格每页最多 20 行。
 */

/** 组织概览：组织成员表每页条数 */
export const LEADER_ORG_MEMBER_PAGE_SIZE = 20

/** 成员详情页：成绩 / 请假 / 违规列表每页条数 */
export const MEMBER_DETAIL_PAGE_SIZE = 20

/**
 * 成员详情页的「只读来源」模块 key：
 * 从这些模块（如老师端班级管理 teacher_m3）进入成员详情时隐藏成绩/违规编辑入口，
 * 老师端在该入口只做学生信息查询，避免展示无权限的编辑按钮。
 */
export const MEMBER_DETAIL_READONLY_FROM_MODULES: string[] = ['teacher_m3']
