/**
 * WebSocket 相关类型定义
 */

/**
 * WebSocket 连接记录
 */
export interface WsConnection {
  /** 连接 ID (API Gateway WebSocket 分配) */
  connectionId: string;

  /** 账户 ID */
  accountId: string;

  /** 连接建立时间 */
  connectedAt: string;

  /** 连接过期时间 (TTL) */
  ttl: number;
}

/**
 * WebSocket 订阅记录
 */
export interface WsSubscription {
  /** 连接 ID */
  connectionId: string;

  /** 订阅的 Automata ID */
  automataId: string;

  /** 订阅时间 */
  subscribedAt: string;

  /** Account ID (用于权限验证) */
  accountId: string;
}

/**
 * WebSocket 临时 Token
 *
 * 一次性 token，用于建立 WebSocket 连接
 * - 有效期：30 秒
 * - 一次性使用
 */
export interface WsToken {
  /** Token 值 */
  token: string;

  /** 账户 ID */
  accountId: string;

  /** 创建时间 */
  createdAt: string;

  /** 过期时间 (Unix timestamp) */
  expiresAt: number;

  /** TTL (DynamoDB 自动清理) */
  ttl: number;
}

// ============================================================
// 上行消息 (Client -> Server)
// ============================================================

/**
 * 订阅 Automata
 */
export interface SubscribeMessage {
  action: 'subscribe';
  automataId: string;
}

/**
 * 取消订阅
 */
export interface UnsubscribeMessage {
  action: 'unsubscribe';
  automataId: string;
}

/**
 * 发送 Event (通过 WebSocket)
 */
export interface SendEventMessage {
  action: 'sendEvent';
  automataId: string;
  eventType: string;
  eventData: unknown;
  requestId: string;
  timestamp: string;
  signature: string;
}

/**
 * Ping (心跳)
 */
export interface PingMessage {
  action: 'ping';
}

/**
 * 所有上行消息类型
 */
export type WsUpstreamMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | SendEventMessage
  | PingMessage;

// ============================================================
// 下行消息 (Server -> Client)
// ============================================================

/**
 * 连接成功
 */
export interface ConnectedMessage {
  type: 'connected';
  connectionId: string;
  timestamp: string;
}

/**
 * 订阅成功
 */
export interface SubscribedMessage {
  type: 'subscribed';
  automataId: string;
  currentState: unknown;
  version: string;
  timestamp: string;
}

/**
 * 取消订阅成功
 */
export interface UnsubscribedMessage {
  type: 'unsubscribed';
  automataId: string;
  timestamp: string;
}

/**
 * 状态更新
 */
export interface StateUpdateMessage {
  type: 'state_update';
  automataId: string;
  eventType: string;
  baseVersion: string;
  newVersion: string;
  newState: unknown;
  timestamp: string;
}

/**
 * Event 发送结果
 */
export interface EventResultMessage {
  type: 'eventResult';
  requestId: string;
  success: boolean;
  automataId?: string;
  baseVersion?: string;
  newVersion?: string;
  newState?: unknown;
  error?: string;
  timestamp: string;
}

/**
 * Pong (心跳响应)
 */
export interface PongMessage {
  type: 'pong';
  timestamp: string;
}

/**
 * 错误消息
 */
export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  timestamp: string;
}

/**
 * 所有下行消息类型
 */
export type WsDownstreamMessage =
  | ConnectedMessage
  | SubscribedMessage
  | UnsubscribedMessage
  | StateUpdateMessage
  | EventResultMessage
  | PongMessage
  | ErrorMessage;
