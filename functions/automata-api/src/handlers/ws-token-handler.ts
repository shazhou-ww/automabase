/**
 * WebSocket Token Handler
 *
 * 提供一次性 WebSocket Token 的获取接口
 */

import type { JwtVerifierConfig, LocalDevConfig } from '@automabase/automata-auth';
import { verifyAndExtractContextWithDevMode } from '@automabase/automata-auth';
import { createWsToken } from '@automabase/automata-core';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * JWT 验证配置
 */
function getJwtConfig(): JwtVerifierConfig {
  return {
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    region: process.env.AWS_REGION || 'ap-northeast-1',
    clientId: process.env.COGNITO_CLIENT_ID,
  };
}

/**
 * 获取本地开发配置
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
 * POST /v1/ws/token
 *
 * 获取一次性 WebSocket Token
 *
 * 请求需要有效的 JWT 认证
 * 返回一个 30 秒有效的一次性 token，用于建立 WebSocket 连接
 */
export async function getWsTokenHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // 1. 验证 JWT
    const token = event.headers.Authorization || event.headers.authorization;
    const jwtConfig = getJwtConfig();
    const localDevConfig = getLocalDevConfig();

    const authContext = await verifyAndExtractContextWithDevMode(token, jwtConfig, localDevConfig);

    // 2. 检查账户是否已注册
    if (!authContext.accountId) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Account not registered',
          code: 'ACCOUNT_NOT_REGISTERED',
        }),
      };
    }

    // 3. 生成一次性 WS Token
    const wsToken = await createWsToken(authContext.accountId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: wsToken.token,
        expiresAt: new Date(wsToken.expiresAt * 1000).toISOString(),
        expiresIn: 30, // 秒
      }),
    };
  } catch (error) {
    console.error('Error getting WS token:', error);

    if (error instanceof Error && error.name === 'JwtVerificationError') {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized',
          code: 'INVALID_TOKEN',
        }),
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      }),
    };
  }
}
