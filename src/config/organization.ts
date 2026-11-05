/**
 * 组织（组织架构）相关常量。
 */

/**
 * 支部判定：组织树链路的祖先深度（上级组织数量）为 3 或 4 时视为支部。
 *
 * 依据 `GET /api/organizations/{id}/tree` 返回的「根组织 → 该组织」链路，
 * 链路深度 = 链条数 - 1（= 根节点的 level）：
 * - 深度 3：井冈山大学 → 学院党委 → 离退休人员党委 → 第一党支部（4 项）
 * - 深度 4：井冈山大学 → 学院党委 → 附属医院(临床医学院)党委 → 第二党总支 → 内科第六党支部（5 项）
 * 以上两种都算支部（链上最后一项 level 恒为 0）；更浅/更深的组织不算支部。
 */
export const BRANCH_ANCESTOR_DEPTHS: readonly number[] = [3, 4]

/**
 * 学院（二级党委）判定：组织树祖先深度为 2 时视为学院层级党委。
 *
 * 依据实际组织树结构：井冈山大学 → 学院党委（容器节点）→ 数理学院党委（3 项），
 * 祖先深度 = 链条数 - 1 = 2。所有二级学院党委（数理、外国语、商学院等）均挂在
 * 「学院党委」容器组织下，深度恒为 2。
 * 供党委学院端工作台、学院支部管理定位当前用户所属「学院」组织。
 */
export const ACADEMY_ANCESTOR_DEPTHS: readonly number[] = [2]

/**
 * 学校（顶级组织）判定：组织树祖先深度为 0，即组织树的根节点（如「井冈山大学」）。
 *
 * 供党委学校端总览定位「学校」组织并统计其党员人数。
 */
export const SCHOOL_ANCESTOR_DEPTHS: readonly number[] = [0]

/**
 * 党委学校端「各二级党委排名」使用的学院容器组织 ID。
 *
 * 实际组织树中，各二级学院党委挂在 ID 为 2 的「学院党委」容器节点下，
 * 而不是直接挂在根组织（ID 为 1）下；因此学校端总览排名需按 2 拉取直接下级。
 */
export const SCHOOL_COLLEGE_PARENT_ORG_ID = 2

/** 党委学校端「组织成员管理」模块 key（组织概览的「查看详细」跳转目标） */
export const SCHOOL_ORG_ADMIN_MODULE_KEY = 'school_m2'

/**
 * 党总支层级判定后缀。
 *
 * 后端组织接口未返回「组织类型」字段，只能按名称后缀识别层级；
 * 关键字统一收敛到 config，避免页面内散落硬编码中文（代码要求 7 / 16）。
 */
export const ORG_GENERAL_BRANCH_NAME_SUFFIX = '总支'

/**
 * 党支部层级判定关键词（与后端按关键词「支部」检索的口径一致，
 * 因此「XX党支部委员会」这类名称中包含「支部」的组织也会计入）。
 */
export const ORG_BRANCH_NAME_KEYWORD = '支部'

/** 党委学校端「组织概览」区域（内嵌在总览页）的会话状态 key，记忆选中组织与树展开态 */
export const SCHOOL_ORG_OVERVIEW_UI_KEY = 'school_org_overview'

/**
 * 党委学院端「学院支部管理」模块 key。
 * 学院工作台点击各支部成绩排名时，按该 key 写入选中支部并跳转，展示该支部成员列表。
 */
export const ACADEMY_BRANCH_MODULE_KEY = 'academy_m5'

/**
 * 组织概览 / 工作台统计下级组织时的并发上限。
 *
 * 人数统一走 POST /organizations/member-counts 批量接口（一次请求可含多个组织 / 职位条件），
 * 先锋指数平均分（organization-average）仍需按组织逐个请求，设上限避免一次性打出过多请求。
 */
export const ORG_OVERVIEW_STATS_CONCURRENCY = 8

/** 批量人数统计接口（POST /organizations/member-counts）单次请求最多条数（接口上限 100） */
export const ORGANIZATION_MEMBER_COUNT_BATCH_SIZE = 100

/**
 * 党员端首页顶部组织链路无法查询到组织树时的兜底根组织名称。
 *
 * 普通党员 / 学生可能没有 `organization.read` 权限，但首页仍需展示组织链路；
 * 此时链路回退为「根组织 + 已解析出的任职组织」，支部名称不会丢失。
 * 该校组织树根节点固定为井冈山大学。
 */
export const PARTY_HOME_ORG_FALLBACK_NAME = '井冈山大学'

/**
 * 组织成员「按用户 ID 搜索」定位时，最多向后扫描的成员分页页数。
 * 目标成员不在第 1 页时会按页扫描以跳到其所在页；设上限避免超大组织搜索时请求过多
 * （每页固定取 100 行，满足代码要求 12；扫描走会话缓存，重复搜索不再发起请求）。
 */
export const MEMBER_SEARCH_MAX_PAGES = 10

/**
 * 组织成员「按姓名搜索」时 GET /api/users?keyword= 的候选上限。
 * 同名/同姓可能对应多个用户，需逐个解析其任职组织并汇总落在当前组织范围内的命中项，
 * 供搜索结果弹窗展示总数与「上一个 / 下一个」切换；
 * 设上限避免候选过多时请求过多（解析走会话缓存，重复搜索不再发起请求）。
 */
export const MEMBER_NAME_SEARCH_LIMIT = 20

/**
 * 「只看匹配人员」模式一次性拉取候选用户的分页大小。
 * 与逐个定位不同，该模式需要把匹配人员汇总成一张表，因此用 100（成员表每页上限）
 * 分页拉取候选用户，再批量解析任职组织后筛出展示范围内的人员。
 */
export const MEMBER_MATCH_ONLY_PAGE_SIZE = 100

/**
 * 「只看匹配人员」模式最多拉取的候选页数（100 人/页，即最多 500 人）。
 * 姓名模糊匹配可能命中很多人，设上限避免一次切换模式发起过多请求；
 * 超出部分不再加载，搜索结果条仍展示后端返回的匹配总数。
 */
export const MEMBER_MATCH_ONLY_MAX_PAGES = 5

/** 数据表格每页最大行数（代码要求 12：表格每页最多 100 行） */
export const MEMBER_TABLE_PAGE_SIZE = 100

/**
 * 组织树搜索框输入防抖时长（毫秒）。
 * 输入草稿保留在搜索组件内部，停顿后再更新过滤关键词，避免每敲一个字符就重建组织树并重渲染整页
 * （代码要求 26）。
 */
export const ORG_SEARCH_DEBOUNCE_MS = 300
