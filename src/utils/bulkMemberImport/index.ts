/**
 * 「批量添加新成员」写入逻辑（可复用，代码要求 1）。
 *
 * 模块拆分：
 *   - types.ts        公共类型（逐行结果 / 请求日志 / 进度状态）
 *   - telemetry.ts    进度推进、请求日志、取消处理
 *   - payloads.ts     表格数据 → 请求体，以及组织任职 / 党员档案差集
 *   - reads.ts        批量 GET 按 100 个 UID 分片（避免 URL 过长导致 431 / 414）
 *   - batching.ts     批量写入按 1000 → 100 → 10 → 1 自适应降级
 *   - submitBatch.ts  批量提交 + 失败后降级并落到具体行
 *   - singlePass.ts   一次性全量导入（最快路径）
 *   - chunk.ts        分片流水线（全量失败后的回退路径）
 *   - outcomes.ts     汇总逐行结果
 *
 * 请求策略（优先「一次性全量导入」，失败再回退到分片流水线）：
 *   1. GET  /api/users?ids=                每 100 个 UID 一批，判断哪些 UID 已存在
 *   2. 全量快速路径（每个写入阶段最多 1000 条/批；失败按 100 → 10 → 1 降级）：
 *      a) POST   /api/users                创建全部新账号
 *      b) GET    /api/rbac/users/roles     每 100 个 UID 一批取回已有角色
 *      c) GET    /api/organization-members 每 100 个 UID 一批取回已有组织任职
 *      d) GET    /api/party/profiles       每 100 个 UID 一批判断是否已建党员档案
 *      e) 批量写入：PATCH /users、DELETE/POST /organization-members、
 *         POST/PATCH /party/profiles、PUT /profile-details、POST /rbac/users
 *      仍无法处理的请求，回退到 3) 的分片流水线；账号已在 2a 建好的不会重复创建。
 *   3. 分片流水线（每片 BULK_ACCOUNT_CREATE_BATCH_SIZE 条，逐片建号并立刻写完该片全部信息）：
 *         - POST   /api/users                     只为该片里不存在的 UID 批量创建账号
 *         - GET    /api/rbac/users/roles          取回该片账号已有角色（用于与表格里的角色合并）
 *         - GET    /api/organization-members      取回该片已有账号的组织任职，逐行比对后只发增删请求
 *         - GET    /api/party/profiles            判断该片已有账号是否已建党员档案
 *         - 批量写入（整批事务，任一项失败整批回滚；失败后按 100 → 10 → 1 降级定位具体行）
 *      组织任职按导入的「组织:身份」同步：缺少的添加，导入里没有的移除；
 *      仅比对组织与身份，不改动原有工作地点。
 *
 * 进度与取消：
 *   - 进度不是按「完成几个人」推进，而是启动前预估总请求数，每发出并结束一个请求推进一格；
 *     全量导入失败回退到分片时，会把后续分片的预估请求数追加进分母；
 *     预估偏高时会在分片结束时自动回落到实际值，保证最终停在 100%。
 *   - 传入 AbortSignal 后，取消会中断在途请求，并停止发送后续请求；已完成的写入不会回滚。
 *   - 每个请求都会通过 onLog 输出一条记录（阶段、方法、路径、条数、结果），供页面导出「导入日志」。
 *
 * 任一步失败都不会中断整批：该行标记为「失败」或「部分成功」，并把原因带回报错弹窗。
 * 注意：本模块会真实写库，页面在调用前必须让用户二次确认。
 */
import type { UserOrganization } from '../../api/types/organizations'
import { queryUsers } from '../../api/users'
import { BULK_ACCOUNT_CREATE_BATCH_SIZE, BULK_IMPORT_SKIP_READS } from '../../config/bulkMembers'
import type { TranslateFn } from '../../i18n'
import type { ParsedMember } from '../bulkMemberCheck'
import { processChunk } from './chunk'
import { buildOutcomes } from './outcomes'
import { planChunkRequests } from './payloads'
import { trySinglePass } from './singlePass'
import {
  beginChunk,
  emitProgress,
  endChunk,
  EXISTING_LOOKUP_BATCH_SIZE,
  initTotal,
  isAbortError,
  runRequest,
  throwIfAborted,
} from './telemetry'
import type {
  ImportState,
  ImportTelemetry,
  MemberImportOutcome,
  MemberImportRequestLog,
} from './types'

export type { MemberImportOutcome, MemberImportRequestLog } from './types'

/**
 * 导入成员（优先一次性全量写入；任一请求失败再回退到分片流水线；真实写库）。
 * @param params.members 已通过校验的成员（必填）
 * @param params.t 翻译函数（必填）
 * @param params.signal 取消信号（可选；取消后停止发送后续请求）
 * @param params.onProgress 进度回调（可选，(已完成请求数, 预估总请求数) => void）
 * @param params.onLog 每个请求结束后的日志回调（可选）
 * @returns Promise<MemberImportOutcome[]> 与 members 顺序一致的逐行结果
 */
export async function importMemberRows(params: {
  members: ParsedMember[]
  t: TranslateFn
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  onLog?: (entry: MemberImportRequestLog) => void
}): Promise<MemberImportOutcome[]> {
  const { members, t, signal, onProgress, onLog } = params
  if (members.length === 0) return []
  if (Object.values(BULK_IMPORT_SKIP_READS).some(Boolean)) {
    console.warn(
      '[bulkMemberImport] 导入阶段的读取已临时关闭，角色可能被覆盖、组织任职可能残留、党员档案可能创建冲突。',
      BULK_IMPORT_SKIP_READS,
    )
  }

  const state: ImportTelemetry = {
    t,
    signal,
    done: 0,
    total: 0,
    seq: 0,
    chunkPlanned: 0,
    chunkExecuted: 0,
    onProgress,
    onLog,
  }

  // 分片（每片先建号，再立刻同步这一片的全部信息）
  const chunks: ParsedMember[][] = []
  for (let start = 0; start < members.length; start += BULK_ACCOUNT_CREATE_BATCH_SIZE) {
    chunks.push(members.slice(start, start + BULK_ACCOUNT_CREATE_BATCH_SIZE))
  }

  // 启动前预估总请求数：存量账号查询 + 一次性全量写入最多可能发出的请求
  const uniqueUids = Array.from(new Set(members.map((member) => member.uid)))
  const lookupRequests = BULK_IMPORT_SKIP_READS.existingUsers
    ? 0
    : Math.ceil(uniqueUids.length / EXISTING_LOOKUP_BATCH_SIZE)
  initTotal(state, lookupRequests + planChunkRequests(members))

  const shared: ImportState = {
    state,
    existingUids: new Set<number>(),
    existingRoles: new Map<number, number[]>(),
    orgByUid: new Map<number, UserOrganization[]>(),
    partyProfileUids: new Set<number>(),
    warningsByRow: new Map<number, string[]>(),
    failed: new Map<number, MemberImportOutcome>(),
    createdRows: new Set<number>(),
    completedRows: new Set<number>(),
  }

  let aborted = false
  try {
    // 1) 先判断哪些 UID 已存在：已存在走更新，其余走创建
    //    临时测试开关：BULK_IMPORT_SKIP_READS.existingUsers = true 时跳过，
    //    全部按新账号创建，已存在账号由 409 兜底识别。
    if (!BULK_IMPORT_SKIP_READS.existingUsers) {
      for (let start = 0; start < uniqueUids.length; start += EXISTING_LOOKUP_BATCH_SIZE) {
        const chunk = uniqueUids.slice(start, start + EXISTING_LOOKUP_BATCH_SIZE)
        beginChunk(state, 1)
        try {
          const res = await runRequest(
            state,
            {
              phaseKey: 'bulkMembers.requestLog.phaseCheckExisting',
              method: 'GET',
              path: '/users',
              count: chunk.length,
            },
            () =>
              queryUsers(
                { page: 1, page_size: chunk.length, ids: chunk.join(',') },
                true,
              ),
          )
          for (const item of res.data) shared.existingUids.add(item.uid)
        } catch (err) {
          if (isAbortError(err)) throw err
          // 判重失败不阻塞导入：这些行会按新账号创建，已存在时由 409 报错
        } finally {
          endChunk(state)
        }
      }
    }

    // 2) 先尝试一次性全量写入：每个阶段只发一个批量请求（整份数据一次提交，速度最快）
    throwIfAborted(signal)
    beginChunk(state, planChunkRequests(members))
    let singlePassOk = false
    try {
      singlePassOk = await trySinglePass(members, shared)
    } finally {
      endChunk(state)
    }

    // 3) 全量写入失败时回退到分片流水线（已在全量阶段创建成功的账号不会重复创建）
    if (!singlePassOk) {
      state.total += chunks.reduce((sum, chunk) => sum + planChunkRequests(chunk), 0)
      emitProgress(state)
      for (const chunk of chunks) {
        throwIfAborted(signal)
        beginChunk(state, planChunkRequests(chunk))
        try {
          await processChunk(chunk, shared)
        } finally {
          endChunk(state)
        }
      }
    }
  } catch (err) {
    if (!isAbortError(err)) throw err
    aborted = true
  }

  if (!aborted) {
    // 预估偏高时把分母收回实际值，确保进度条走满
    state.total = Math.max(state.total, state.done)
    state.done = state.total
    emitProgress(state)
  }

  return buildOutcomes(members, shared, t)
}
