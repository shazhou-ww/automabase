/**
 * Automata - 状态机实例（显式实体）
 *
 * Automata 是基于 Blueprint 创建的状态机实例，归属于创建它的 Account。
 * 当 Blueprint 是 AppRegistry 时，Automata 表示一个 App。
 */

/**
 * Automata 状态枚举
 */
export type AutomataStatus = 'active' | 'archived';

/**
 * Automata 实体
 */
export interface Automata {
  // === 不可变属性 ===

  /** 主键：ULID 格式 */
  automataId: string;

  /** 归属的 Account ID（使用者，非开发者） */
  ownerAccountId: string;

  /** Blueprint 标识：{appId}:{name}:{hash} 或 SYSTEM:{name}:{hash} */
  blueprintId: string;

  /** 从 blueprintId 解析的 appId（冗余存储用于 GSI2） */
  appId: string;

  /** 创建时间 */
  createdAt: string; // ISO8601

  // === 可变属性 ===

  /** 当前状态 */
  currentState: unknown;

  /** 当前版本号：6 位 Base62 编码 */
  version: string;

  /** 状态 */
  status: AutomataStatus;

  /** 最后更新时间 */
  updatedAt: string; // ISO8601
}

/**
 * DynamoDB Item 结构
 */
export interface AutomataItem extends Automata {
  /** PK: AUTOMATA#{automataId} */
  pk: string;

  /** SK: #META */
  sk: string;

  /** GSI1PK: ACCOUNT#{ownerAccountId} - 按用户查询 Automata */
  gsi1pk: string;

  /** GSI1SK: {createdAt}#{automataId} - 按时间排序 */
  gsi1sk: string;

  /** GSI2PK: APP#{appId} - 按 App 查询 Automata */
  gsi2pk: string;

  /** GSI2SK: {createdAt}#{automataId} - 按时间排序 */
  gsi2sk: string;
}

/**
 * 创建 Automata 的输入参数
 */
export interface CreateAutomataInput {
  /** 归属的 Account ID */
  ownerAccountId: string;

  /** Blueprint ID（已验证并存储） */
  blueprintId: string;

  /** 初始状态 */
  initialState: unknown;
}

/**
 * 更新 Automata 的输入参数
 */
export interface UpdateAutomataInput {
  /** 新状态（可选） */
  currentState?: unknown;

  /** 新版本号（可选） */
  version?: string;

  /** 状态（可选） */
  status?: AutomataStatus;
}

/**
 * 判断 Automata 是否为 App（使用 AppRegistry Blueprint）
 */
export function isAppAutomata(automata: Automata): boolean {
  return automata.blueprintId.startsWith('SYSTEM:AppRegistry:');
}
