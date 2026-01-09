import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  getCurrentAccount,
  createOrGetAccount,
  updateCurrentAccount,
  getAccount,
} from './handlers/account-handlers';
import {
  createAutomataHandler,
  listAutomatasHandler,
  getAutomataHandler,
  getAutomataStateHandler,
  updateAutomataHandler,
} from './handlers/automata-handlers';
import {
  sendEventHandler,
  listEventsHandler,
  getEventHandler,
} from './handlers/event-handlers';

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
  { method: 'GET', pathPattern: /^\/v1\/accounts\/[^/]+$/, handler: getAccount },

  // Automata API
  { method: 'POST', pathPattern: /^\/v1\/automatas$/, handler: createAutomataHandler },
  { method: 'GET', pathPattern: /^\/v1\/automatas$/, handler: listAutomatasHandler },
  { method: 'GET', pathPattern: /^\/v1\/automatas\/[^/]+\/state$/, handler: getAutomataStateHandler },
  { method: 'GET', pathPattern: /^\/v1\/automatas\/[^/]+$/, handler: getAutomataHandler },
  { method: 'PATCH', pathPattern: /^\/v1\/automatas\/[^/]+$/, handler: updateAutomataHandler },

  // Event API
  { method: 'POST', pathPattern: /^\/v1\/automatas\/[^/]+\/events$/, handler: sendEventHandler },
  { method: 'GET', pathPattern: /^\/v1\/automatas\/[^/]+\/events$/, handler: listEventsHandler },
  { method: 'GET', pathPattern: /^\/v1\/automatas\/[^/]+\/events\/[^/]+$/, handler: getEventHandler },
];

/**
 * 匹配路由
 */
function matchRoute(method: string, path: string): RouteHandler | null {
  for (const route of routes) {
    if (route.method === method && route.pathPattern.test(path)) {
      return route.handler;
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-Request-Timestamp, X-Request-Signature',
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
  
  console.log(`${method} ${path}`);
  
  // CORS 预检
  if (method === 'OPTIONS') {
    return handleOptions();
  }
  
  // 路由匹配
  const routeHandler = matchRoute(method, path);
  if (!routeHandler) {
    return notFound();
  }
  
  try {
    return await routeHandler(event);
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
