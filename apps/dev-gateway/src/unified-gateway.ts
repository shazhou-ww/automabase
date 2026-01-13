/**
 * Unified API Gateway
 *
 * 在同一端口上处理 HTTP API 和 WebSocket API：
 * - HTTP 请求按路由转发到对应的 Lambda
 * - WebSocket 请求处理 $connect / $disconnect / $default
 * - Management API (POST /@connections/{connectionId})
 *
 * 路由配置与 AWS API Gateway 保持一致
 */

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import type { JwtVerifier } from './jwt-verifier';
import type { LambdaInvoker } from './lambda-invoker';
import type {
  GatewayConfig,
  JwtClaims,
  LambdaHttpEvent,
  LambdaWsEvent,
  RouteConfig,
} from './types';

/**
 * 活跃 WebSocket 连接
 */
const connectionMap = new Map<string, WebSocket>();

/**
 * 连接的 JWT claims
 */
const connectionClaims = new Map<string, JwtClaims>();

/**
 * 获取活跃连接数
 */
export function getActiveConnectionCount(): number {
  return connectionMap.size;
}

/**
 * 读取请求体
 */
function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * 解析查询字符串
 */
function parseQueryString(queryString: string): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  if (!queryString) return params;

  const searchParams = new URLSearchParams(queryString);
  for (const [key, value] of searchParams) {
    params[key] = value;
  }
  return params;
}

/**
 * 匹配路由模板
 */
function matchRoute(
  pathname: string,
  method: string,
  routes: RouteConfig[]
): { route: RouteConfig; pathParams: Record<string, string> } | null {
  for (const route of routes) {
    // 检查 HTTP 方法
    if (route.method !== 'ANY' && route.method !== method) {
      continue;
    }

    // 匹配路径模板
    const templateParts = route.path.split('/');
    const actualParts = pathname.split('/');

    if (templateParts.length !== actualParts.length) continue;

    const pathParams: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < templateParts.length; i++) {
      const template = templateParts[i];
      const actual = actualParts[i];

      if (template.startsWith('{') && template.endsWith('}')) {
        // 路径参数
        const paramName = template.slice(1, -1).replace('+', ''); // 移除 proxy+ 的 +
        pathParams[paramName] = decodeURIComponent(actual);
      } else if (template !== actual) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { route, pathParams };
    }
  }

  return null;
}

/**
 * 处理 Management API 请求
 */
function handleManagementApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  connectionId: string,
  method: string
): void {
  if (method === 'POST') {
    // POST /@connections/{connectionId} - 发送消息
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      const socket = connectionMap.get(connectionId);
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        res.writeHead(410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Gone' }));
        return;
      }

      try {
        socket.send(Buffer.concat(chunks));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'OK' }));
      } catch (err) {
        console.error(`[WS] Failed to send to ${connectionId}:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Failed to send' }));
      }
    });
  } else if (method === 'DELETE') {
    // DELETE /@connections/{connectionId} - 断开连接
    const socket = connectionMap.get(connectionId);
    if (socket) {
      socket.close(1000, 'Connection terminated by server');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Disconnected' }));
    } else {
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Gone' }));
    }
  } else if (method === 'GET') {
    // GET /@connections/{connectionId} - 获取连接信息
    const socket = connectionMap.get(connectionId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          connectionId,
          connected: true,
          claims: connectionClaims.get(connectionId) || null,
        })
      );
    } else {
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Gone' }));
    }
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Method Not Allowed' }));
  }
}

/**
 * 处理 HTTP API 请求
 */
async function handleHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: GatewayConfig,
  jwtVerifier: JwtVerifier,
  lambdaInvoker: LambdaInvoker
): Promise<void> {
  const requestId = crypto.randomUUID();
  const url = new URL(req.url || '/', `http://localhost:${config.port}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  // Health check
  if ((pathname === '/health' || pathname === '/v1/health') && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        gateway: 'dev-gateway',
        connections: connectionMap.size,
      })
    );
    return;
  }

  // 匹配路由
  const matched = matchRoute(pathname, method, config.routes);

  if (!matched) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not Found', path: pathname }));
    return;
  }

  const { route, pathParams } = matched;

  // JWT 验证
  let claims: JwtClaims | null = null;
  const authHeader = req.headers.authorization || (req.headers.Authorization as string);

  if (route.auth !== false) {
    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', code: 'MISSING_TOKEN' }));
      return;
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    claims = await jwtVerifier.verify(token);

    if (!claims) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized', code: 'INVALID_TOKEN' }));
      return;
    }
  }

  // 读取请求体
  const body = await readRequestBody(req);

  // 转换请求头
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = Array.isArray(value) ? value[0] : value;
  }

  // 构建 Lambda 事件
  const event: LambdaHttpEvent = {
    httpMethod: method,
    path: pathname,
    headers,
    queryStringParameters:
      Object.keys(parseQueryString(url.search.slice(1))).length > 0
        ? parseQueryString(url.search.slice(1))
        : null,
    pathParameters: Object.keys(pathParams).length > 0 ? pathParams : null,
    body: body.length > 0 ? body.toString('utf-8') : null,
    isBase64Encoded: false,
    requestContext: {
      requestId,
      stage: 'local',
      authorizer: claims ? { claims } : undefined,
    },
  };

  // 调用 Lambda
  try {
    const result = await lambdaInvoker.invokeHttpApi(event, route.function);

    // 返回响应
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      ...result.headers,
    };

    res.writeHead(result.statusCode, responseHeaders);
    res.end(result.body || '');
  } catch (err) {
    console.error(`[HTTP] Lambda error:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}

/**
 * 处理 WebSocket 连接
 */
async function handleWebSocketConnection(
  ws: WebSocket,
  req: http.IncomingMessage,
  config: GatewayConfig,
  jwtVerifier: JwtVerifier,
  lambdaInvoker: LambdaInvoker
): Promise<void> {
  const connectionId = crypto.randomUUID();
  const url = new URL(req.url || '/', `ws://localhost:${config.port}`);
  const token = url.searchParams.get('token') || undefined;

  console.log(`[WS] Connection attempt: ${connectionId} (token=${token ? 'yes' : 'no'})`);

  // JWT 验证（如果提供了 token）
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

  // 找到 WebSocket Lambda 函数
  const wsFunction =
    config.routes.find((r) => r.type === 'websocket')?.function || config.functions.websocket;

  // 调用 $connect
  try {
    const connectEvent: LambdaWsEvent = {
      requestContext: {
        routeKey: '$connect',
        connectionId,
        eventType: 'CONNECT',
        stage: 'local',
        requestId: crypto.randomUUID(),
        domainName: `localhost:${config.port}`,
        authorizer: claims ? { claims } : undefined,
      },
      queryStringParameters: Object.fromEntries(url.searchParams),
      isBase64Encoded: false,
    };

    const result = await lambdaInvoker.invokeWebSocket(connectEvent, wsFunction);

    if (result.statusCode >= 400) {
      console.log(`[WS] $connect rejected (${result.statusCode}): ${result.body}`);
      connectionMap.delete(connectionId);
      connectionClaims.delete(connectionId);
      ws.close(1008, result.body || 'Connection rejected');
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
    try {
      const body = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);

      const messageEvent: LambdaWsEvent = {
        requestContext: {
          routeKey: '$default',
          connectionId,
          eventType: 'MESSAGE',
          stage: 'local',
          requestId: crypto.randomUUID(),
          domainName: `localhost:${config.port}`,
        },
        body,
        isBase64Encoded: false,
      };

      await lambdaInvoker.invokeWebSocket(messageEvent, wsFunction);
    } catch (err) {
      console.error(`[WS] $default error:`, err);
    }
  });

  // 处理断开
  ws.on('close', async () => {
    console.log(`[WS] Disconnected: ${connectionId}`);
    connectionMap.delete(connectionId);
    connectionClaims.delete(connectionId);

    try {
      const disconnectEvent: LambdaWsEvent = {
        requestContext: {
          routeKey: '$disconnect',
          connectionId,
          eventType: 'DISCONNECT',
          stage: 'local',
          requestId: crypto.randomUUID(),
          domainName: `localhost:${config.port}`,
        },
        isBase64Encoded: false,
      };

      await lambdaInvoker.invokeWebSocket(disconnectEvent, wsFunction);
    } catch (err) {
      console.error(`[WS] $disconnect error:`, err);
    }
  });

  // 错误处理
  ws.on('error', (err) => {
    console.error(`[WS] Error on ${connectionId}:`, err);
  });
}

/**
 * 创建统一网关
 */
export function createUnifiedGateway(
  config: GatewayConfig,
  jwtVerifier: JwtVerifier,
  lambdaInvoker: LambdaInvoker
): http.Server {
  // HTTP 服务器
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${config.port}`);
    const method = req.method || 'GET';

    // Health check endpoint for dev server detection
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', gateway: 'unified' }));
      return;
    }

    console.log(`[HTTP] ${method} ${url.pathname}`);

    // Management API: /@connections/{connectionId}
    const connectionsMatch = url.pathname.match(/^\/@connections\/(.+)$/);
    if (connectionsMatch) {
      const connectionId = decodeURIComponent(connectionsMatch[1]);
      handleManagementApi(req, res, connectionId, method);
      return;
    }

    // 普通 HTTP 请求
    await handleHttpRequest(req, res, config, jwtVerifier, lambdaInvoker);
  });

  // WebSocket 服务器（共享 HTTP 服务器）
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    handleWebSocketConnection(ws, req, config, jwtVerifier, lambdaInvoker);
  });

  return server;
}
