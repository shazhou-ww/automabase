/**
 * WebSocket API Gateway
 *
 * 模拟 AWS API Gateway WebSocket API 的行为：
 * - $connect / $disconnect / $default 路由
 * - JWT 验证（在 $connect 阶段）
 * - Management API (PostToConnection)
 */

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import type { JwtVerifier } from './jwt-verifier';
import type { LambdaInvoker } from './lambda-invoker';
import type { GatewayConfig, JwtClaims, LambdaWsEvent } from './types';

/**
 * 活跃连接映射
 */
const connectionMap = new Map<string, WebSocket>();

/**
 * 连接的 claims 映射
 */
const connectionClaims = new Map<string, JwtClaims>();

/**
 * 创建 Management API 处理器
 */
function createManagementApiHandler(res: http.ServerResponse, connectionId: string, body: Buffer) {
  const socket = connectionMap.get(connectionId);

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    res.writeHead(410, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Gone' }));
    return;
  }

  try {
    socket.send(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'OK' }));
  } catch (err) {
    console.error(`[WS] Failed to send to ${connectionId}:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Failed to send' }));
  }
}

/**
 * 创建 WebSocket Gateway
 */
export function createWebSocketGateway(
  config: GatewayConfig,
  jwtVerifier: JwtVerifier,
  lambdaInvoker: LambdaInvoker
): http.Server {
  // HTTP 服务器处理 Management API
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${config.wsPort}`);

    // Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, gateway: 'dev-gateway-ws' }));
      return;
    }

    // Management API: POST /@connections/{connectionId}
    const connectionsMatch = url.pathname.match(/^\/@connections\/(.+)$/);
    if (connectionsMatch && req.method === 'POST') {
      const connectionId = decodeURIComponent(connectionsMatch[1]);
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        createManagementApiHandler(res, connectionId, body);
      });
      return;
    }

    // DELETE /@connections/{connectionId} - 断开连接
    if (connectionsMatch && req.method === 'DELETE') {
      const connectionId = decodeURIComponent(connectionsMatch[1]);
      const socket = connectionMap.get(connectionId);

      if (socket) {
        socket.close(1000, 'Connection terminated by server');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Disconnected' }));
      } else {
        res.writeHead(410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Gone' }));
      }
      return;
    }

    // 未知请求
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not Found' }));
  });

  // WebSocket 服务器
  const wss = new WebSocketServer({ server });

  wss.on('connection', async (ws, req) => {
    const connectionId = crypto.randomUUID();
    const url = new URL(req.url || '/', `ws://localhost:${config.wsPort}`);
    const token = url.searchParams.get('token') || undefined;

    console.log(`[WS] Connection attempt: ${connectionId} (token=${token ? 'yes' : 'no'})`);

    // JWT 验证
    let claims: JwtClaims | null = null;
    if (token) {
      claims = await jwtVerifier.verify(token);
      if (!claims) {
        console.log(`[WS] Connection rejected: invalid token`);
        ws.close(1008, 'Unauthorized');
        return;
      }
    }

    // 存储连接
    connectionMap.set(connectionId, ws);
    if (claims) {
      connectionClaims.set(connectionId, claims);
    }

    // 调用 $connect
    try {
      const connectEvent: LambdaWsEvent = {
        requestContext: {
          routeKey: '$connect',
          connectionId,
          eventType: 'CONNECT',
          stage: 'local',
          requestId: crypto.randomUUID(),
          domainName: `localhost:${config.wsPort}`,
          authorizer: claims ? { claims } : undefined,
        },
        queryStringParameters: Object.fromEntries(url.searchParams),
        isBase64Encoded: false,
      };

      const result = await lambdaInvoker.invokeWebSocket(connectEvent);

      if (result.statusCode >= 400) {
        console.log(`[WS] $connect rejected (${result.statusCode}): ${result.body}`);
        connectionMap.delete(connectionId);
        connectionClaims.delete(connectionId);
        ws.close(1008, result.body);
        return;
      }

      console.log(`[WS] Connected: ${connectionId}`);
    } catch (err) {
      console.error(`[WS] $connect error:`, err);
      connectionMap.delete(connectionId);
      connectionClaims.delete(connectionId);
      ws.close(1011, 'Internal error');
      return;
    }

    // 处理消息
    ws.on('message', async (data) => {
      const body = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);

      console.log(`[WS] Message from ${connectionId}: ${body.substring(0, 100)}`);

      try {
        const messageEvent: LambdaWsEvent = {
          requestContext: {
            routeKey: '$default',
            connectionId,
            eventType: 'MESSAGE',
            stage: 'local',
            requestId: crypto.randomUUID(),
            domainName: `localhost:${config.wsPort}`,
            authorizer: connectionClaims.get(connectionId)
              ? { claims: connectionClaims.get(connectionId) }
              : undefined,
          },
          body,
          isBase64Encoded: false,
        };

        await lambdaInvoker.invokeWebSocket(messageEvent);
      } catch (err) {
        console.error(`[WS] $default error:`, err);
      }
    });

    // 处理断开
    ws.on('close', async () => {
      console.log(`[WS] Disconnecting: ${connectionId}`);

      try {
        const disconnectEvent: LambdaWsEvent = {
          requestContext: {
            routeKey: '$disconnect',
            connectionId,
            eventType: 'DISCONNECT',
            stage: 'local',
            requestId: crypto.randomUUID(),
            domainName: `localhost:${config.wsPort}`,
          },
          isBase64Encoded: false,
        };

        await lambdaInvoker.invokeWebSocket(disconnectEvent);
      } catch (err) {
        console.error(`[WS] $disconnect error:`, err);
      }

      connectionMap.delete(connectionId);
      connectionClaims.delete(connectionId);
      console.log(`[WS] Disconnected: ${connectionId}`);
    });

    // 处理错误
    ws.on('error', (err) => {
      console.error(`[WS] Socket error for ${connectionId}:`, err);
    });
  });

  return server;
}

/**
 * 获取当前活跃连接数
 */
export function getActiveConnectionCount(): number {
  return connectionMap.size;
}

/**
 * 获取所有活跃连接 ID
 */
export function getActiveConnectionIds(): string[] {
  return Array.from(connectionMap.keys());
}
