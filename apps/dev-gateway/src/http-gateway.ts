/**
 * HTTP API Gateway
 *
 * 模拟 AWS API Gateway HTTP API 的行为：
 * - 路由请求到 Lambda
 * - JWT 验证
 * - 请求/响应转换
 */

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { JwtVerifier } from './jwt-verifier';
import type { LambdaInvoker } from './lambda-invoker';
import { RequestTimer } from './timing-logger';
import type { GatewayConfig, JwtClaims, LambdaHttpEvent } from './types';

/**
 * 不需要认证的路径
 */
const PUBLIC_PATHS = ['/health', '/v1/health'];

/**
 * 读取请求体
 */
function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * 解析路径参数
 */
function parsePathParams(pathTemplate: string, actualPath: string): Record<string, string> | null {
  // 简化实现：匹配 {param} 模式
  const templateParts = pathTemplate.split('/');
  const actualParts = actualPath.split('/');

  if (templateParts.length !== actualParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < templateParts.length; i++) {
    const template = templateParts[i];
    const actual = actualParts[i];

    if (template.startsWith('{') && template.endsWith('}')) {
      const paramName = template.slice(1, -1);
      params[paramName] = actual;
    } else if (template !== actual) {
      return null;
    }
  }

  return params;
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
 * 创建 HTTP API Gateway
 */
export function createHttpGateway(
  config: GatewayConfig,
  jwtVerifier: JwtVerifier,
  lambdaInvoker: LambdaInvoker
): http.Server {
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // 解析 URL
    const url = new URL(req.url || '/', `http://localhost:${config.httpPort}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    // 创建计时器
    const timer = new RequestTimer(requestId, method, pathname);

    console.log(`[HTTP] ${method} ${pathname}`);

    try {
      // Health check
      if (PUBLIC_PATHS.includes(pathname) && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, gateway: 'dev-gateway' }));
        timer.mark('health_check');
        timer.finish(200);
        return;
      }

      // JWT 验证
      let claims: JwtClaims | null = null;
      const authHeader = req.headers.authorization || (req.headers.Authorization as string);

      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '');
        claims = await jwtVerifier.verify(token);
        timer.mark('jwt_verify');

        if (!claims && !PUBLIC_PATHS.includes(pathname)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized', code: 'INVALID_TOKEN' }));
          timer.finish(401);
          return;
        }
      } else if (!PUBLIC_PATHS.includes(pathname)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized', code: 'MISSING_TOKEN' }));
        timer.finish(401);
        return;
      }

      // 读取请求体
      const body = await readRequestBody(req);
      timer.mark('read_body');

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
        pathParameters: null, // 由 Lambda 路由解析
        body: body || null,
        isBase64Encoded: false,
        requestContext: {
          requestId,
          stage: 'local',
          authorizer: claims ? { claims } : undefined,
        },
      };
      timer.mark('build_event');

      // 调用 Lambda
      const result = await lambdaInvoker.invokeHttpApi(event);
      timer.mark('lambda_invoke');

      // 返回响应
      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...result.headers,
      };

      res.writeHead(result.statusCode, responseHeaders);
      res.end(result.body);
      timer.mark('send_response');

      timer.finish(result.statusCode);
    } catch (err) {
      console.error(`[HTTP] Error handling ${method} ${pathname}:`, err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', code: 'GATEWAY_ERROR' }));
      timer.finish(500);
    }
  });

  return server;
}
