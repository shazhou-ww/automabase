/**
 * WebSocket Repository
 *
 * 管理 WebSocket 连接、订阅和临时 Token
 */

import { randomBytes } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { WsConnection, WsSubscription, WsToken } from '../types/websocket';
import { docClient, getTableName, Keys } from './client';

const TABLE_NAME = getTableName();

// Token 有效期：30 秒
const WS_TOKEN_TTL_SECONDS = 30;

// 连接有效期：2 小时
const WS_CONNECTION_TTL_SECONDS = 2 * 60 * 60;

// ============================================================
// Key 生成工具
// ============================================================

const WsKeys = {
  // WS Token
  wsTokenPk: (token: string) => `WSTOKEN#${token}`,

  // WS Connection
  wsConnectionPk: (connectionId: string) => `WSCONN#${connectionId}`,

  // WS Subscription - 按连接查询
  wsSubByConnPk: (connectionId: string) => `WSSUB#CONN#${connectionId}`,
  wsSubByConnSk: (automataId: string) => `AUTOMATA#${automataId}`,

  // WS Subscription - 按 Automata 查询 (用于广播)
  wsSubByAutomataPk: (automataId: string) => `WSSUB#AUTOMATA#${automataId}`,
  wsSubByAutomataSk: (connectionId: string) => `CONN#${connectionId}`,
};

// ============================================================
// WS Token 操作
// ============================================================

/**
 * 生成一次性 WebSocket Token
 */
export async function createWsToken(accountId: string): Promise<WsToken> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = Math.floor(now.getTime() / 1000) + WS_TOKEN_TTL_SECONDS;
  const ttl = expiresAt + 60; // 多保留 1 分钟给 DynamoDB 清理

  const wsToken: WsToken = {
    token,
    accountId,
    createdAt: now.toISOString(),
    expiresAt,
    ttl,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: WsKeys.wsTokenPk(token),
        sk: Keys.metaSk(),
        ...wsToken,
      },
    })
  );

  return wsToken;
}

/**
 * 验证并消费 WS Token (一次性)
 *
 * @returns accountId 如果 token 有效，null 如果无效或已使用
 */
export async function consumeWsToken(token: string): Promise<string | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: WsKeys.wsTokenPk(token),
        sk: Keys.metaSk(),
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  const wsToken = result.Item as WsToken & { pk: string; sk: string };

  // 检查是否过期
  const now = Math.floor(Date.now() / 1000);
  if (wsToken.expiresAt < now) {
    return null;
  }

  // 删除 token (一次性使用)
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: WsKeys.wsTokenPk(token),
        sk: Keys.metaSk(),
      },
    })
  );

  return wsToken.accountId;
}

// ============================================================
// WS Connection 操作
// ============================================================

/**
 * 保存连接记录
 */
export async function saveConnection(connection: WsConnection): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + WS_CONNECTION_TTL_SECONDS;

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: WsKeys.wsConnectionPk(connection.connectionId),
        sk: Keys.metaSk(),
        ...connection,
        ttl,
      },
    })
  );
}

/**
 * 获取连接记录
 */
export async function getConnection(connectionId: string): Promise<WsConnection | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: WsKeys.wsConnectionPk(connectionId),
        sk: Keys.metaSk(),
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  return result.Item as WsConnection;
}

/**
 * 删除连接记录及其所有订阅
 */
export async function deleteConnection(connectionId: string): Promise<void> {
  // 1. 获取该连接的所有订阅
  const subscriptions = await getSubscriptionsByConnection(connectionId);

  // 2. 删除所有订阅
  for (const sub of subscriptions) {
    await deleteSubscription(connectionId, sub.automataId);
  }

  // 3. 删除连接记录
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: WsKeys.wsConnectionPk(connectionId),
        sk: Keys.metaSk(),
      },
    })
  );
}

// ============================================================
// WS Subscription 操作
// ============================================================

/**
 * 创建订阅
 *
 * 使用双写模式：同时写入按连接索引和按 Automata 索引
 */
export async function createSubscription(subscription: WsSubscription): Promise<void> {
  const { connectionId, automataId, accountId, subscribedAt } = subscription;
  const ttl = Math.floor(Date.now() / 1000) + WS_CONNECTION_TTL_SECONDS;

  // 双写：按连接索引
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: WsKeys.wsSubByConnPk(connectionId),
        sk: WsKeys.wsSubByConnSk(automataId),
        connectionId,
        automataId,
        accountId,
        subscribedAt,
        ttl,
      },
    })
  );

  // 双写：按 Automata 索引 (用于广播)
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: WsKeys.wsSubByAutomataPk(automataId),
        sk: WsKeys.wsSubByAutomataSk(connectionId),
        connectionId,
        automataId,
        accountId,
        subscribedAt,
        ttl,
      },
    })
  );
}

/**
 * 删除订阅
 */
export async function deleteSubscription(connectionId: string, automataId: string): Promise<void> {
  // 双删
  await Promise.all([
    docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: WsKeys.wsSubByConnPk(connectionId),
          sk: WsKeys.wsSubByConnSk(automataId),
        },
      })
    ),
    docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: WsKeys.wsSubByAutomataPk(automataId),
          sk: WsKeys.wsSubByAutomataSk(connectionId),
        },
      })
    ),
  ]);
}

/**
 * 获取连接的所有订阅
 */
export async function getSubscriptionsByConnection(
  connectionId: string
): Promise<WsSubscription[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': WsKeys.wsSubByConnPk(connectionId),
      },
    })
  );

  return (result.Items || []) as WsSubscription[];
}

/**
 * 获取 Automata 的所有订阅者 (用于广播)
 */
export async function getSubscribersByAutomata(automataId: string): Promise<WsSubscription[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': WsKeys.wsSubByAutomataPk(automataId),
      },
    })
  );

  return (result.Items || []) as WsSubscription[];
}

/**
 * 检查连接是否订阅了指定 Automata
 */
export async function isSubscribed(connectionId: string, automataId: string): Promise<boolean> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: WsKeys.wsSubByConnPk(connectionId),
        sk: WsKeys.wsSubByConnSk(automataId),
      },
    })
  );

  return !!result.Item;
}
