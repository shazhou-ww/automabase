/**
 * Event API Handlers
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getAutomataById,
  updateAutomata,
  getBlueprintById,
  createEvent,
  queryEvents,
  getEvent,
  processEvent,
  TransitionError,
  incrementVersion,
  generateEventId,
  type QueryEventsInput,
} from '@automabase/automata-core';
import {
  verifyAndExtractContextWithDevMode,
  JwtVerificationError,
  type JwtVerifierConfig,
  type LocalDevConfig,
} from '@automabase/automata-auth';

/**
 * 获取 JWT 验证配置
 */
function getJwtConfig(): JwtVerifierConfig {
  return {
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    region: process.env.AWS_REGION || 'ap-northeast-1',
    clientId: process.env.COGNITO_CLIENT_ID,
  };
}

/**
 * 获取本地开发模式配置
 */
function getLocalDevConfig(): LocalDevConfig {
  return {
    enabled: process.env.LOCAL_DEV_MODE === 'true',
  };
}

/**
 * 创建成功响应
 */
function success(data: unknown, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(data),
  };
}

/**
 * 创建错误响应
 */
function error(message: string, statusCode = 400, code?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ error: message, code }),
  };
}

/**
 * 验证 JWT 并检查用户是否有权访问指定的 accountId
 * 
 * 设计原则：JWT 只负责身份验证，accountId 从路径参数获取
 */
async function verifyAccessToAccount(
  event: APIGatewayProxyEvent,
  accountId: string
): Promise<{ verified: true } | APIGatewayProxyResult> {
  const token = event.headers.Authorization || event.headers.authorization;
  const authContext = await verifyAndExtractContextWithDevMode(
    token,
    getJwtConfig(),
    getLocalDevConfig()
  );

  // 本地开发模式下跳过权限检查
  if (getLocalDevConfig().enabled) {
    return { verified: true };
  }

  // 检查用户是否有权访问该 accountId
  if (authContext.accountId !== accountId) {
    return error('Access denied to this account', 403, 'ACCESS_DENIED');
  }

  return { verified: true };
}

/**
 * 从路径参数获取 accountId
 */
function getAccountIdFromPath(event: APIGatewayProxyEvent): string | null {
  return event.pathParameters?.accountId || null;
}

/**
 * POST /accounts/{accountId}/automatas/{automataId}/events - 发送 Event
 *
 * Body: {
 *   eventType: string,
 *   eventData: unknown
 * }
 */
export async function sendEventHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const accountId = getAccountIdFromPath(event);
    if (!accountId) {
      return error('accountId is required in path', 400);
    }

    const authResult = await verifyAccessToAccount(event, accountId);
    if ('statusCode' in authResult) return authResult;

    const automataId = event.pathParameters?.automataId;
    if (!automataId) {
      return error('automataId is required', 400);
    }

    // 获取 Automata
    const automata = await getAutomataById(automataId);
    if (!automata) {
      return error('Automata not found', 404);
    }

    // 检查 automata 是否属于该 account
    if (automata.ownerAccountId !== accountId) {
      return error('Automata does not belong to this account', 404);
    }

    // 检查状态
    if (automata.status !== 'active') {
      return error('Automata is not active', 400, 'AUTOMATA_NOT_ACTIVE');
    }

    // 解析请求体
    const body = JSON.parse(event.body || '{}');
    const { eventType, eventData } = body as {
      eventType: string;
      eventData: unknown;
    };

    if (!eventType) {
      return error('eventType is required', 400);
    }

    // 获取 Blueprint
    const blueprint = await getBlueprintById(automata.blueprintId);
    if (!blueprint) {
      return error('Blueprint not found', 500, 'BLUEPRINT_NOT_FOUND');
    }

    // 执行状态转换
    const newState = await processEvent(
      blueprint,
      automata.currentState,
      eventType,
      eventData
    );

    // 计算新版本号
    const baseVersion = automata.version;
    const newVersion = incrementVersion(baseVersion);

    // 创建 Event 记录
    const eventRecord = await createEvent(
      {
        automataId,
        eventType,
        eventData,
        senderAccountId: accountId,
      },
      baseVersion
    );

    // 更新 Automata 状态
    await updateAutomata(automataId, {
      currentState: newState,
      version: newVersion,
    });

    return success({
      eventId: generateEventId(automataId, baseVersion),
      baseVersion,
      newVersion,
      newState,
      timestamp: eventRecord.timestamp,
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    if (err instanceof TransitionError) {
      return error(err.message, 400, err.code);
    }
    // 处理乐观锁冲突
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return error('Version conflict. Please retry with latest version.', 409, 'VERSION_CONFLICT');
    }
    console.error('Error sending event:', err);
    return error('Internal server error', 500);
  }
}

/**
 * GET /accounts/{accountId}/automatas/{automataId}/events - 查询 Events
 */
export async function listEventsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const accountId = getAccountIdFromPath(event);
    if (!accountId) {
      return error('accountId is required in path', 400);
    }

    const authResult = await verifyAccessToAccount(event, accountId);
    if ('statusCode' in authResult) return authResult;

    const automataId = event.pathParameters?.automataId;
    if (!automataId) {
      return error('automataId is required', 400);
    }

    // 获取 Automata 并检查
    const automata = await getAutomataById(automataId);
    if (!automata) {
      return error('Automata not found', 404);
    }
    if (automata.ownerAccountId !== accountId) {
      return error('Automata does not belong to this account', 404);
    }

    // 解析查询参数
    const direction = (event.queryStringParameters?.direction || 'forward') as 'forward' | 'backward';
    const anchor = event.queryStringParameters?.anchor;
    const limit = parseInt(event.queryStringParameters?.limit || '100', 10);

    const input: QueryEventsInput = {
      automataId,
      direction,
      anchor,
      limit: Math.min(limit, 1000),
    };

    const result = await queryEvents(input);

    return success({
      events: result.events.map((e) => ({
        eventId: generateEventId(e.automataId, e.baseVersion),
        baseVersion: e.baseVersion,
        eventType: e.eventType,
        eventData: e.eventData,
        senderAccountId: e.senderAccountId,
        timestamp: e.timestamp,
      })),
      nextAnchor: result.nextAnchor,
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error listing events:', err);
    return error('Internal server error', 500);
  }
}

/**
 * GET /accounts/{accountId}/automatas/{automataId}/events/{baseVersion} - 获取单个 Event
 */
export async function getEventHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const accountId = getAccountIdFromPath(event);
    if (!accountId) {
      return error('accountId is required in path', 400);
    }

    const authResult = await verifyAccessToAccount(event, accountId);
    if ('statusCode' in authResult) return authResult;

    const automataId = event.pathParameters?.automataId;
    const baseVersion = event.pathParameters?.baseVersion;

    if (!automataId || !baseVersion) {
      return error('automataId and baseVersion are required', 400);
    }

    // 获取 Automata 并检查
    const automata = await getAutomataById(automataId);
    if (!automata) {
      return error('Automata not found', 404);
    }
    if (automata.ownerAccountId !== accountId) {
      return error('Automata does not belong to this account', 404);
    }

    // 获取 Event
    const eventRecord = await getEvent(automataId, baseVersion);
    if (!eventRecord) {
      return error('Event not found', 404);
    }

    return success({
      eventId: generateEventId(eventRecord.automataId, eventRecord.baseVersion),
      baseVersion: eventRecord.baseVersion,
      eventType: eventRecord.eventType,
      eventData: eventRecord.eventData,
      senderAccountId: eventRecord.senderAccountId,
      timestamp: eventRecord.timestamp,
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error getting event:', err);
    return error('Internal server error', 500);
  }
}

