/**
 * WebSocket 连接处理器
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  consumeWsToken,
  saveConnection,
  deleteConnection,
  getConnection,
} from '@automabase/automata-core';
import type { WsConnection, ConnectedMessage } from '@automabase/automata-core';

/**
 * 处理 WebSocket 连接 ($connect)
 */
export async function handleConnect(
  connectionId: string,
  queryParams: Record<string, string | undefined>
): Promise<APIGatewayProxyResult> {
  const token = queryParams.token;

  if (!token) {
    console.log('[WS] Connection rejected: missing token');
    return {
      statusCode: 401,
      body: 'Missing token',
    };
  }

  // 验证并消费一次性 token
  const accountId = await consumeWsToken(token);

  if (!accountId) {
    console.log('[WS] Connection rejected: invalid or expired token');
    return {
      statusCode: 401,
      body: 'Invalid or expired token',
    };
  }

  // 保存连接记录
  const connection: WsConnection = {
    connectionId,
    accountId,
    connectedAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 2 * 60 * 60, // 2 小时
  };

  await saveConnection(connection);

  console.log(`[WS] Connected: ${connectionId} for account ${accountId}`);

  return {
    statusCode: 200,
    body: 'Connected',
  };
}

/**
 * 处理 WebSocket 断开 ($disconnect)
 */
export async function handleDisconnect(connectionId: string): Promise<APIGatewayProxyResult> {
  console.log(`[WS] Disconnecting: ${connectionId}`);

  await deleteConnection(connectionId);

  console.log(`[WS] Disconnected: ${connectionId}`);

  return {
    statusCode: 200,
    body: 'Disconnected',
  };
}

/**
 * 获取连接的账户 ID
 */
export async function getConnectionAccountId(connectionId: string): Promise<string | null> {
  const connection = await getConnection(connectionId);
  return connection?.accountId || null;
}

/**
 * 生成连接成功消息
 */
export function createConnectedMessage(connectionId: string): ConnectedMessage {
  return {
    type: 'connected',
    connectionId,
    timestamp: new Date().toISOString(),
  };
}
