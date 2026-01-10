/**
 * Event - 状态转换事件（显式实体）
 *
 * Event 触发 Automata 的状态转换，是不可变的审计记录。
 */

/**
 * Event 实体
 */
export interface AutomataEvent {
  // 全部不可变

  /** 归属自动机 ID（联合主键 1） */
  automataId: string;

  /** 基准版本号（联合主键 2）：6 位 Base62 编码 */
  baseVersion: string;

  /** 事件类型 */
  eventType: string;

  /** 事件负载数据 */
  eventData: unknown;

  /** 发送者 Account ID */
  senderAccountId: string;

  /** 事件时间戳 */
  timestamp: string; // ISO8601
}

/**
 * DynamoDB Item 结构
 */
export interface EventItem extends AutomataEvent {
  /** PK: AUTOMATA#{automataId} */
  pk: string;

  /** SK: EVT#{baseVersion} */
  sk: string;

  /** LSI1SK: EVTYPE#{eventType}#{baseVersion} - 按事件类型查询 */
  lsi1sk: string;
}

/**
 * 创建 Event 的输入参数
 */
export interface CreateEventInput {
  /** 归属自动机 ID */
  automataId: string;

  /** 事件类型 */
  eventType: string;

  /** 事件负载数据 */
  eventData: unknown;

  /** 发送者 Account ID */
  senderAccountId: string;
}

/**
 * Event 查询参数
 */
export interface QueryEventsInput {
  /** 归属自动机 ID */
  automataId: string;

  /** 查询方向：forward（从旧到新）或 backward（从新到旧） */
  direction?: 'forward' | 'backward';

  /** 起始版本号（可选） */
  anchor?: string;

  /** 返回数量限制 */
  limit?: number;
}

/**
 * Event 查询结果
 */
export interface QueryEventsResult {
  /** 事件列表 */
  events: AutomataEvent[];

  /** 下一页锚点（如果有更多） */
  nextAnchor?: string;
}

/**
 * 生成 Event ID
 * 格式：event:{automataId}:{baseVersion}
 */
export function generateEventId(automataId: string, baseVersion: string): string {
  return `event:${automataId}:${baseVersion}`;
}

/**
 * 解析 Event ID
 */
export function parseEventId(eventId: string): {
  automataId: string;
  baseVersion: string;
} {
  const parts = eventId.split(':');
  if (parts.length !== 3 || parts[0] !== 'event') {
    throw new Error(`Invalid eventId format: ${eventId}`);
  }
  return {
    automataId: parts[1],
    baseVersion: parts[2],
  };
}
