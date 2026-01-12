/**
 * Automata WebSocket Lambda Handler
 *
 * 处理 WebSocket 连接、订阅和消息
 */

import type { ErrorMessage, PongMessage, WsUpstreamMessage } from '@automabase/automata-core';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  APIGatewayProxyWebsocketEventV2,
  Context,
} from 'aws-lambda';
import { handleConnect, handleDisconnect } from './handlers/connection-handlers';
import { handleSubscribe, handleUnsubscribe } from './handlers/subscription-handlers';
import { createSendMessageFn, initApiGatewayClient } from './services/broadcast-service';

/**
 * WebSocket 事件类型
 */
type WsRouteKey = '$connect' | '$disconnect' | '$default' | 'subscribe' | 'unsubscribe' | 'ping';

/**
 * 从 API Gateway 事件中提取 WebSocket endpoint
 */
function getWebSocketEndpoint(event: APIGatewayProxyEvent): string {
  const { domainName, stage } = event.requestContext as {
    domainName?: string;
    stage?: string;
  };

  if (domainName && stage) {
    return `https://${domainName}/${stage}`;
  }

  // 本地开发时使用环境变量
  return process.env.WEBSOCKET_API_ENDPOINT || 'http://localhost:3001';
}

/**
 * Lambda 入口
 */
export const handler = async (
  event: APIGatewayProxyEvent | APIGatewayProxyWebsocketEventV2,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  // 获取 WebSocket 连接 ID
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    console.error('[WS] Missing connectionId');
    return { statusCode: 400, body: 'Missing connectionId' };
  }

  // 获取路由键（$connect, $disconnect, 或 action 名称）
  const routeKey = (event.requestContext as { routeKey?: string }).routeKey as WsRouteKey;

  console.log(`[WS] Route: ${routeKey}, ConnectionId: ${connectionId}`);

  // 初始化 API Gateway 客户端
  initApiGatewayClient(getWebSocketEndpoint(event as APIGatewayProxyEvent));

  // 创建发送消息函数
  const sendMessage = createSendMessageFn(connectionId);

  try {
    switch (routeKey) {
      case '$connect': {
        const queryParams = (event as APIGatewayProxyEvent).queryStringParameters || {};
        return await handleConnect(connectionId, queryParams);
      }

      case '$disconnect': {
        return await handleDisconnect(connectionId);
      }

      case '$default': {
        // 解析消息
        const body = event.body;
        if (!body) {
          return { statusCode: 400, body: 'Empty message' };
        }

        let message: WsUpstreamMessage;
        try {
          message = JSON.parse(body) as WsUpstreamMessage;
        } catch {
          const errorMsg: ErrorMessage = {
            type: 'error',
            code: 'INVALID_JSON',
            message: 'Invalid JSON message',
            timestamp: new Date().toISOString(),
          };
          await sendMessage(errorMsg);
          return { statusCode: 400, body: 'Invalid JSON' };
        }

        // 根据 action 分发
        return await handleMessage(connectionId, message, sendMessage);
      }

      default: {
        console.log(`[WS] Unknown route: ${routeKey}`);
        return { statusCode: 400, body: 'Unknown route' };
      }
    }
  } catch (error) {
    console.error('[WS] Handler error:', error);
    const errorMsg: ErrorMessage = {
      type: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
    };
    await sendMessage(errorMsg);
    return { statusCode: 500, body: 'Internal error' };
  }
};

/**
 * 处理消息分发
 */
async function handleMessage(
  connectionId: string,
  message: WsUpstreamMessage,
  sendMessage: (message: unknown) => Promise<void>
): Promise<APIGatewayProxyResult> {
  switch (message.action) {
    case 'subscribe':
      return await handleSubscribe(connectionId, message.automataId, sendMessage);

    case 'unsubscribe':
      return await handleUnsubscribe(connectionId, message.automataId, sendMessage);

    case 'ping': {
      const pongMsg: PongMessage = {
        type: 'pong',
        timestamp: new Date().toISOString(),
      };
      await sendMessage(pongMsg);
      return { statusCode: 200, body: 'pong' };
    }

    case 'sendEvent': {
      // TODO: 实现通过 WebSocket 发送事件
      // 需要签名验证，暂时禁用
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'NOT_IMPLEMENTED',
        message: 'Sending events via WebSocket is not yet implemented. Use REST API instead.',
        timestamp: new Date().toISOString(),
      };
      await sendMessage(errorMsg);
      return { statusCode: 501, body: 'Not implemented' };
    }

    default: {
      const errorMsg: ErrorMessage = {
        type: 'error',
        code: 'UNKNOWN_ACTION',
        message: `Unknown action: ${(message as { action?: string }).action}`,
        timestamp: new Date().toISOString(),
      };
      await sendMessage(errorMsg);
      return { statusCode: 400, body: 'Unknown action' };
    }
  }
}
