/**
 * WebSocket 广播服务
 *
 * 用于向订阅者广播状态更新
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { deleteSubscription, getSubscribersByAutomata } from '../db/ws-repository';
import type { StateUpdateMessage } from '../types/websocket';

// 客户端缓存
let apiGatewayClient: ApiGatewayManagementApiClient | null = null;
let currentEndpoint: string | null = null;

/**
 * 获取或创建 API Gateway Management API 客户端
 */
function getApiGatewayClient(endpoint: string): ApiGatewayManagementApiClient {
  if (!apiGatewayClient || currentEndpoint !== endpoint) {
    apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint,
    });
    currentEndpoint = endpoint;
  }
  return apiGatewayClient;
}

/**
 * 向指定连接发送消息
 */
async function sendToConnection(
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  message: unknown
): Promise<boolean> {
  try {
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
      console.log(`[WS] Connection ${connectionId} is gone`);
      return false;
    }
    console.error(`[WS] Failed to send to ${connectionId}:`, error);
    return false;
  }
}

/**
 * 广播选项
 */
export interface BroadcastOptions {
  /** WebSocket API endpoint (例如: https://xxx.execute-api.region.amazonaws.com/stage) */
  wsEndpoint: string;
}

/**
 * 广播状态更新到所有订阅者
 *
 * @param automataId - Automata ID
 * @param eventType - 事件类型
 * @param baseVersion - 基准版本号
 * @param newVersion - 新版本号
 * @param newState - 新状态
 * @param options - 广播选项
 * @returns 广播结果 { total: number, success: number }
 */
export async function broadcastStateUpdate(
  automataId: string,
  eventType: string,
  baseVersion: string,
  newVersion: string,
  newState: unknown,
  options: BroadcastOptions
): Promise<{ total: number; success: number }> {
  const subscribers = await getSubscribersByAutomata(automataId);

  if (subscribers.length === 0) {
    return { total: 0, success: 0 };
  }

  console.log(`[WS] Broadcasting to ${subscribers.length} subscribers for ${automataId}`);

  const message: StateUpdateMessage = {
    type: 'state',
    automataId,
    eventType,
    baseVersion,
    newVersion,
    newState,
    timestamp: new Date().toISOString(),
  };

  const client = getApiGatewayClient(options.wsEndpoint);

  // 并行发送到所有订阅者
  const results = await Promise.all(
    subscribers.map(async (sub) => {
      const success = await sendToConnection(client, sub.connectionId, message);
      return { connectionId: sub.connectionId, automataId: sub.automataId, success };
    })
  );

  // 清理失效的连接
  const failedConnections = results.filter((r) => !r.success);
  for (const { connectionId, automataId: subAutomataId } of failedConnections) {
    console.log(`[WS] Cleaning up stale subscription: ${connectionId} -> ${subAutomataId}`);
    await deleteSubscription(connectionId, subAutomataId);
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(`[WS] Broadcast complete: ${successCount}/${subscribers.length} succeeded`);

  return { total: subscribers.length, success: successCount };
}

/**
 * 检查是否需要广播
 *
 * 如果没有配置 WebSocket endpoint，则跳过广播
 */
export function shouldBroadcast(wsEndpoint: string | undefined): wsEndpoint is string {
  return !!wsEndpoint && wsEndpoint.length > 0;
}
