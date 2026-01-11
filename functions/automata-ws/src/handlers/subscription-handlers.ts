/**
 * WebSocket 订阅处理器
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  createSubscription,
  deleteSubscription,
  getConnection,
  getAutomataById,
} from '@automabase/automata-core';
import type {
  WsSubscription,
  SubscribedMessage,
  UnsubscribedMessage,
  ErrorMessage,
} from '@automabase/automata-core';

/**
 * 处理订阅请求
 */
export async function handleSubscribe(
  connectionId: string,
  automataId: string,
  sendMessage: (message: unknown) => Promise<void>
): Promise<APIGatewayProxyResult> {
  console.log(`[WS] Subscribe request: ${connectionId} -> ${automataId}`);

  try {
    // 1. 获取连接信息
    const connection = await getConnection(connectionId);
    if (!connection) {
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'CONNECTION_NOT_FOUND',
        message: 'Connection not found',
        timestamp: new Date().toISOString(),
      };
      await sendMessage(errorMsg);
      return { statusCode: 400, body: 'Connection not found' };
    }

    // 2. 验证 Automata 存在且属于该用户
    const automata = await getAutomataById(automataId);
    if (!automata) {
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'AUTOMATA_NOT_FOUND',
        message: 'Automata not found',
        timestamp: new Date().toISOString(),
      };
      await sendMessage(errorMsg);
      return { statusCode: 404, body: 'Automata not found' };
    }

    if (automata.ownerAccountId !== connection.accountId) {
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'ACCESS_DENIED',
        message: 'Access denied to this automata',
        timestamp: new Date().toISOString(),
      };
      await sendMessage(errorMsg);
      return { statusCode: 403, body: 'Access denied' };
    }

    // 3. 创建订阅
    const subscription: WsSubscription = {
      connectionId,
      automataId,
      accountId: connection.accountId,
      subscribedAt: new Date().toISOString(),
    };
    await createSubscription(subscription);

    // 4. 发送订阅成功消息，包含当前状态
    const subscribedMsg: SubscribedMessage = {
      type: 'subscribed',
      automataId,
      currentState: automata.currentState,
      version: automata.version,
      timestamp: new Date().toISOString(),
    };
    await sendMessage(subscribedMsg);

    console.log(`[WS] Subscribed: ${connectionId} -> ${automataId}`);
    return { statusCode: 200, body: 'Subscribed' };
  } catch (error) {
    console.error('[WS] Subscribe error:', error);
    const errorMsg: ErrorMessage = {
      type: 'error',
      code: 'SUBSCRIBE_ERROR',
      message: 'Failed to subscribe',
      timestamp: new Date().toISOString(),
    };
    await sendMessage(errorMsg);
    return { statusCode: 500, body: 'Subscribe error' };
  }
}

/**
 * 处理取消订阅请求
 */
export async function handleUnsubscribe(
  connectionId: string,
  automataId: string,
  sendMessage: (message: unknown) => Promise<void>
): Promise<APIGatewayProxyResult> {
  console.log(`[WS] Unsubscribe request: ${connectionId} -> ${automataId}`);

  try {
    await deleteSubscription(connectionId, automataId);

    const unsubscribedMsg: UnsubscribedMessage = {
      type: 'unsubscribed',
      automataId,
      timestamp: new Date().toISOString(),
    };
    await sendMessage(unsubscribedMsg);

    console.log(`[WS] Unsubscribed: ${connectionId} -> ${automataId}`);
    return { statusCode: 200, body: 'Unsubscribed' };
  } catch (error) {
    console.error('[WS] Unsubscribe error:', error);
    const errorMsg: ErrorMessage = {
      type: 'error',
      code: 'UNSUBSCRIBE_ERROR',
      message: 'Failed to unsubscribe',
      timestamp: new Date().toISOString(),
    };
    await sendMessage(errorMsg);
    return { statusCode: 500, body: 'Unsubscribe error' };
  }
}
