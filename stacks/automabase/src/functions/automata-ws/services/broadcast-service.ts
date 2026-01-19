/**
 * WebSocket 消息广播服务
 */

import type { StateUpdateMessage } from '@automabase/automata-core';
import { deleteSubscription, getSubscribersByAutomata } from '@automabase/automata-core';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

let apiGatewayClient: ApiGatewayManagementApiClient | null = null;

/**
 * 初始化 API Gateway Management API 客户端
 */
export function initApiGatewayClient(endpoint: string): void {
  apiGatewayClient = new ApiGatewayManagementApiClient({
    endpoint,
  });
}

/**
 * 获取 API Gateway 客户端
 */
function getApiGatewayClient(): ApiGatewayManagementApiClient {
  if (!apiGatewayClient) {
    throw new Error('API Gateway client not initialized. Call initApiGatewayClient first.');
  }
  return apiGatewayClient;
}

/**
 * 向指定连接发送消息
 */
export async function sendToConnection(connectionId: string, message: unknown): Promise<boolean> {
  try {
    const client = getApiGatewayClient();
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      })
    );
    return true;
  } catch (error) {
    // GoneException 表示连接已断开
    if (error instanceof Error && error.name === 'GoneException') {
      console.log(`[WS] Connection ${connectionId} is gone, will be cleaned up`);
      return false;
    }
    console.error(`[WS] Failed to send to ${connectionId}:`, error);
    return false;
  }
}

/**
 * 创建发送消息的函数（用于 handler）
 */
export function createSendMessageFn(connectionId: string): (message: unknown) => Promise<void> {
  return async (message: unknown) => {
    await sendToConnection(connectionId, message);
  };
}

/**
 * 广播状态更新到所有订阅者
 */
export async function broadcastStateUpdate(
  automataId: string,
  eventType: string,
  baseVersion: string,
  newVersion: string,
  newState: unknown
): Promise<void> {
  const subscribers = await getSubscribersByAutomata(automataId);

  if (subscribers.length === 0) {
    console.log(`[WS] No subscribers for automata ${automataId}`);
    return;
  }

  console.log(`[WS] Broadcasting to ${subscribers.length} subscribers for ${automataId}`);

  const message: StateUpdateMessage = {
    type: 'state_update',
    automataId,
    eventType,
    baseVersion,
    newVersion,
    newState,
    timestamp: new Date().toISOString(),
  };

  // 并行发送到所有订阅者
  const results = await Promise.all(
    subscribers.map(async (sub: { connectionId: string }) => {
      const success = await sendToConnection(sub.connectionId, message);
      return { connectionId: sub.connectionId, success };
    })
  );

  // 清理失效的连接
  const failedConnections = results.filter(
    (r: { connectionId: string; success: boolean }) => !r.success
  );
  for (const { connectionId } of failedConnections) {
    console.log(`[WS] Cleaning up stale subscription: ${connectionId} -> ${automataId}`);
    await deleteSubscription(connectionId, automataId);
  }

  console.log(
    `[WS] Broadcast complete: ${results.filter((r: { connectionId: string; success: boolean }) => r.success).length}/${subscribers.length} succeeded`
  );
}
