/**
 * 党员端个人信息相关常量（代码要求 7：常量集中管理）。
 *
 * 党员端「我的」页与党委支部端 / 学院端 / 学校端成员详情「基本信息」共用同一展示口径：
 * - 政治面貌：取任职职位名称，命中以下党员身份职位名时展示，书记等其他职位忽略；
 * - 所属支部：取成员第一项任职组织名称；
 * - 党员编号 / 入党时间：取 GET /api/party/profiles 返回的党员档案。
 */
export const PARTY_POLITICAL_STATUS_NAMES: readonly string[] = ['中共党员', '中共预备党员']

/**
 * 正式党员身份对应的职位名称。
 * 党委支部端 / 学院端工作台按该职位名称统计「党员人数」：
 * 职位名称经 GET /api/positions 解析为职位编码后，作为
 * POST /api/organizations/member-counts 的一条条件（position + recursive=true）。
 */
export const PARTY_FULL_MEMBER_STATUS_NAME = '中共党员'

/**
 * 预备党员身份对应的职位名称。
 * 党委学校端「组织概览」按该职位名称统计各下级组织的预备党员人数
 * （职位名称 → 职位编码经 GET /api/positions 解析，再走批量人数接口 member-counts）；
 * 党委支部端 / 学院端工作台同样按该职位名称统计「预备党员人数」。
 */
export const PARTY_PROBATIONARY_STATUS_NAME = '中共预备党员'
