/**
 * Automata API Handlers
 */

import {
  JwtVerificationError,
  type JwtVerifierConfig,
  type LocalDevConfig,
  verifyAndExtractContextWithDevMode,
} from '@automabase/automata-auth';
import {
  type BlueprintContent,
  BlueprintValidationError,
  createAutomata,
  getAccountByOAuth,
  getAutomataById,
  getAutomatasByAccount,
  getBlueprintById,
  updateAutomata,
  validateAndGetBlueprint,
} from '@automabase/automata-core';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

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
 * 获取本地 JWT 配置
 *
 * 如果设置了 LOCAL_JWT_PUBLIC_KEY，则使用本地 JWT 验证（bypass Cognito）
 * 否则使用正常的 Cognito 验证
 */
function getLocalDevConfig(): LocalDevConfig {
  const localPublicKey = process.env.LOCAL_JWT_PUBLIC_KEY;

  return {
    enabled: !!localPublicKey,
    localPublicKey,
    localIssuer: process.env.LOCAL_JWT_ISSUER || 'local-dev',
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
 * - 验证 JWT token 有效性
 * - 检查用户是否有权访问该 accountId（目前：用户只能访问自己的 account）
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
  // 方式1：如果 token 里有 accountId，直接比较
  if (authContext.accountId) {
    if (authContext.accountId !== accountId) {
      return error('Access denied to this account', 403, 'ACCESS_DENIED');
    }
    return { verified: true };
  }

  // 方式2：通过 cognitoUserId 从数据库查询用户的账户
  const oauthSubject = authContext.identityProvider?.userId || authContext.cognitoUserId;
  const oauthProvider = authContext.identityProvider?.name || 'cognito';

  const userAccount = await getAccountByOAuth(oauthProvider, oauthSubject);
  if (!userAccount || userAccount.accountId !== accountId) {
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
 * POST /accounts/{accountId}/automatas - 创建 Automata
 *
 * Body: {
 *   blueprint: BlueprintContent,
 *   blueprintSignature?: string,
 *   initialEvent?: { eventType: string, eventData: unknown }
 * }
 */
export async function createAutomataHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const accountId = getAccountIdFromPath(event);
    if (!accountId) {
      return error('accountId is required in path', 400);
    }

    const authResult = await verifyAccessToAccount(event, accountId);
    if ('statusCode' in authResult) return authResult;

    // 解析请求体
    const body = JSON.parse(event.body || '{}');
    const { blueprint, blueprintSignature } = body as {
      blueprint: BlueprintContent;
      blueprintSignature?: string;
    };

    if (!blueprint) {
      return error('blueprint is required', 400);
    }

    if (!blueprint.appId || !blueprint.name) {
      return error('blueprint.appId and blueprint.name are required', 400);
    }

    // 验证并获取/创建 Blueprint
    const blueprintId = await validateAndGetBlueprint(
      blueprint,
      blueprintSignature || null,
      accountId
    );

    // 创建 Automata
    const automata = await createAutomata({
      ownerAccountId: accountId,
      blueprintId,
      initialState: blueprint.state.initial,
    });

    return success(
      {
        automataId: automata.automataId,
        blueprintId: automata.blueprintId,
        currentState: automata.currentState,
        version: automata.version,
        createdAt: automata.createdAt,
      },
      201
    );
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    if (err instanceof BlueprintValidationError) {
      return error(err.message, 400, err.code);
    }
    console.error('Error creating automata:', err);
    return error('Internal server error', 500);
  }
}

/**
 * GET /accounts/{accountId}/automatas - 列出指定账户的 Automatas
 */
export async function listAutomatasHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const accountId = getAccountIdFromPath(event);
    if (!accountId) {
      return error('accountId is required in path', 400);
    }

    const authResult = await verifyAccessToAccount(event, accountId);
    if ('statusCode' in authResult) return authResult;

    const limit = parseInt(event.queryStringParameters?.limit || '100', 10);
    const cursor = event.queryStringParameters?.cursor;

    const { automatas, nextCursor } = await getAutomatasByAccount(accountId, {
      limit: Math.min(limit, 100),
      cursor,
    });

    return success({
      automatas: automatas.map((a) => ({
        automataId: a.automataId,
        blueprintId: a.blueprintId,
        version: a.version,
        status: a.status,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      nextCursor,
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error listing automatas:', err);
    return error('Internal server error', 500);
  }
}

/**
 * GET /accounts/{accountId}/automatas/{automataId} - 获取 Automata 详情
 */
export async function getAutomataHandler(
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

    const automata = await getAutomataById(automataId);
    if (!automata) {
      return error('Automata not found', 404);
    }

    // 检查 automata 是否属于该 account
    if (automata.ownerAccountId !== accountId) {
      return error('Automata does not belong to this account', 404);
    }

    // 获取 Blueprint 详情
    const blueprint = await getBlueprintById(automata.blueprintId);

    return success({
      automataId: automata.automataId,
      ownerAccountId: automata.ownerAccountId,
      blueprintId: automata.blueprintId,
      blueprint: blueprint || null,
      currentState: automata.currentState,
      version: automata.version,
      status: automata.status,
      createdAt: automata.createdAt,
      updatedAt: automata.updatedAt,
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error getting automata:', err);
    return error('Internal server error', 500);
  }
}

/**
 * GET /accounts/{accountId}/automatas/{automataId}/state - 获取 Automata 当前状态
 */
export async function getAutomataStateHandler(
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

    const automata = await getAutomataById(automataId);
    if (!automata) {
      return error('Automata not found', 404);
    }

    // 检查 automata 是否属于该 account
    if (automata.ownerAccountId !== accountId) {
      return error('Automata does not belong to this account', 404);
    }

    return success({
      automataId: automata.automataId,
      currentState: automata.currentState,
      version: automata.version,
      status: automata.status,
      updatedAt: automata.updatedAt,
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error getting automata state:', err);
    return error('Internal server error', 500);
  }
}

/**
 * PATCH /accounts/{accountId}/automatas/{automataId} - 更新 Automata（归档等）
 */
export async function updateAutomataHandler(
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

    const automata = await getAutomataById(automataId);
    if (!automata) {
      return error('Automata not found', 404);
    }

    // 检查 automata 是否属于该 account
    if (automata.ownerAccountId !== accountId) {
      return error('Automata does not belong to this account', 404);
    }

    // 解析请求体
    const body = JSON.parse(event.body || '{}');
    const { status } = body as { status?: 'active' | 'archived' };

    if (status && !['active', 'archived'].includes(status)) {
      return error('Invalid status. Must be "active" or "archived"', 400);
    }

    const updated = await updateAutomata(automataId, { status });

    return success({
      automataId: updated?.automataId,
      status: updated?.status,
      updatedAt: updated?.updatedAt,
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error updating automata:', err);
    return error('Internal server error', 500);
  }
}
