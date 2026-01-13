import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  createOrGetAccount,
  getAccount,
  getCurrentAccount,
  updateCurrentAccount,
} from './handlers/account-handlers';
import {
  archiveAutomataHandler,
  createAutomataHandler,
  getAutomataHandler,
  getAutomataStateHandler,
  listAutomatasHandler,
  unarchiveAutomataHandler,
} from './handlers/automata-handlers';
import { getEventHandler, listEventsHandler, sendEventHandler } from './handlers/event-handlers';
import { getWsTokenHandler } from './handlers/ws-token-handler';

/**
 * 路由定义
 */
type RouteHandler = (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

interface Route {
  method: string;
  pathPattern: RegExp;
  handler: RouteHandler;
}

const routes: Route[] = [
  // Account API
  { method: 'GET', pathPattern: /^\/v1\/accounts\/me$/, handler: getCurrentAccount },
  { method: 'POST', pathPattern: /^\/v1\/accounts$/, handler: createOrGetAccount },
  { method: 'PATCH', pathPattern: /^\/v1\/accounts\/me$/, handler: updateCurrentAccount },
  { method: 'GET', pathPattern: /^\/v1\/accounts\/(?<accountId>[^/]+)$/, handler: getAccount },

  // WebSocket Token API
  { method: 'POST', pathPattern: /^\/v1\/ws\/token$/, handler: getWsTokenHandler },

  // Automata API - nested under /accounts/{accountId}
  {
    method: 'POST',
    pathPattern: /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas$/,
    handler: createAutomataHandler,
  },
  {
    method: 'GET',
    pathPattern: /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas$/,
    handler: listAutomatasHandler,
  },
  {
    method: 'GET',
    pathPattern: /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas\/(?<automataId>[^/]+)\/state$/,
    handler: getAutomataStateHandler,
  },
  {
    method: 'GET',
    pathPattern: /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas\/(?<automataId>[^/]+)$/,
    handler: getAutomataHandler,
  },
  {
    method: 'POST',
    pathPattern: /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas\/(?<automataId>[^/]+)\/archive$/,
    handler: archiveAutomataHandler,
  },
  {
    method: 'POST',
    pathPattern:
      /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas\/(?<automataId>[^/]+)\/unarchive$/,
    handler: unarchiveAutomataHandler,
  },

  // Event API - nested under /accounts/{accountId}/automatas/{automataId}
  {
    method: 'POST',
    pathPattern: /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas\/(?<automataId>[^/]+)\/events$/,
    handler: sendEventHandler,
  },
  {
    method: 'GET',
    pathPattern: /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas\/(?<automataId>[^/]+)\/events$/,
    handler: listEventsHandler,
  },
  {
    method: 'GET',
    pathPattern:
      /^\/v1\/accounts\/(?<accountId>[^/]+)\/automatas\/(?<automataId>[^/]+)\/events\/(?<baseVersion>[^/]+)$/,
    handler: getEventHandler,
  },
];

/**
 * 匹配路由并提取路径参数
 */
function matchRoute(
  method: string,
  path: string
): { handler: RouteHandler; pathParams: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method === method) {
      const match = route.pathPattern.exec(path);
      if (match) {
        // 提取命名捕获组作为路径参数
        const pathParams = match.groups || {};
        return { handler: route.handler, pathParams };
      }
    }
  }
  return null;
}

/**
 * CORS 预检处理
 */
function handleOptions(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Request-Id, X-Request-Timestamp, X-Request-Signature',
      'Access-Control-Max-Age': '86400',
    },
    body: '',
  };
}

/**
 * 404 响应
 */
function notFound(): APIGatewayProxyResult {
  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ error: 'Not found' }),
  };
}

/**
 * Lambda 入口
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;

  console.log(`[Lambda] ${method} ${path}`);

  // CORS 预检
  if (method === 'OPTIONS') {
    return handleOptions();
  }

  // 路由匹配
  const routeMatch = matchRoute(method, path);
  if (!routeMatch) {
    return notFound();
  }

  // 合并路径参数到 event.pathParameters
  const enrichedEvent: APIGatewayProxyEvent = {
    ...event,
    pathParameters: {
      ...event.pathParameters,
      ...routeMatch.pathParams,
    },
  };

  try {
    return await routeMatch.handler(enrichedEvent);
  } catch (error) {
    console.error('Unhandled error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
