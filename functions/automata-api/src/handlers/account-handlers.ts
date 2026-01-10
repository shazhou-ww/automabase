/**
 * Account API Handlers
 */

import {
  JwtVerificationError,
  type JwtVerifierConfig,
  type LocalDevConfig,
  verifyAndExtractContextWithDevMode,
} from '@automabase/automata-auth';
import {
  type CreateAccountInput,
  getAccountById,
  getAccountByOAuth,
  getOrCreateAccountByOAuth,
  type OAuthProvider,
  type UpdateAccountInput,
  updateAccount,
  validateBase64PublicKey,
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
 * GET /accounts/me - 获取当前用户
 */
export async function getCurrentAccount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const token = event.headers.Authorization || event.headers.authorization;
    const authContext = await verifyAndExtractContextWithDevMode(
      token,
      getJwtConfig(),
      getLocalDevConfig()
    );

    // 如果用户已经有 accountId（来自 JWT custom claim），直接查询
    if (authContext.accountId) {
      const account = await getAccountById(authContext.accountId);
      if (account) {
        return success({ account, registered: true });
      }
    }

    // 尝试通过 OAuth 信息查找已存在的账户
    // 如果没有外部 IdP，使用 'cognito' 作为 provider
    const oauthProvider: OAuthProvider =
      (authContext.identityProvider?.name?.toLowerCase() as OAuthProvider) || 'cognito';
    const oauthSubject = authContext.identityProvider?.userId || authContext.cognitoUserId;

    // 同时尝试查询可能遗留的 'google' provider（兼容旧数据）
    let existingAccount = await getAccountByOAuth(oauthProvider, oauthSubject);
    if (!existingAccount && oauthProvider === 'cognito') {
      // 兼容旧逻辑：之前可能用 'google' 作为默认 provider
      existingAccount = await getAccountByOAuth('google', oauthSubject);
    }
    if (existingAccount) {
      return success({ account: existingAccount, registered: true });
    }

    // 用户已通过 Cognito 认证，但尚未在 Automabase 注册
    return success({
      registered: false,
      cognitoUser: {
        sub: authContext.cognitoUserId,
        email: authContext.email,
        name: authContext.displayName,
        picture: authContext.avatarUrl,
        identityProvider: authContext.identityProvider,
      },
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error getting current account:', err);
    return error('Internal server error', 500);
  }
}

/**
 * POST /accounts - 创建或获取账户（首次注册）
 *
 * Body: { publicKey: string }
 */
export async function createOrGetAccount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const token = event.headers.Authorization || event.headers.authorization;
    const authContext = await verifyAndExtractContextWithDevMode(
      token,
      getJwtConfig(),
      getLocalDevConfig()
    );

    // 解析请求体
    const body = JSON.parse(event.body || '{}');
    const { publicKey } = body;

    if (!publicKey) {
      return error('publicKey is required', 400);
    }

    // 验证公钥格式
    if (!validateBase64PublicKey(publicKey)) {
      return error('Invalid publicKey format (expected 32-byte Ed25519 key in Base64URL)', 400);
    }

    // 确定 OAuth 信息（如果没有外部 IdP，使用 'cognito'）
    const oauthProvider: OAuthProvider =
      (authContext.identityProvider?.name?.toLowerCase() as OAuthProvider) || 'cognito';
    const oauthSubject = authContext.identityProvider?.userId || authContext.cognitoUserId;

    // 创建或获取账户
    const input: CreateAccountInput = {
      publicKey,
      oauthProvider,
      oauthSubject,
      displayName: authContext.displayName || 'Anonymous',
      email: authContext.email,
      avatarUrl: authContext.avatarUrl,
    };

    const { account, isNew } = await getOrCreateAccountByOAuth(input);

    return success({ account, isNew }, isNew ? 201 : 200);
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error creating account:', err);
    return error('Internal server error', 500);
  }
}

/**
 * PATCH /accounts/me - 更新当前用户
 *
 * Body: { displayName?, email?, avatarUrl? }
 */
export async function updateCurrentAccount(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const token = event.headers.Authorization || event.headers.authorization;
    const authContext = await verifyAndExtractContextWithDevMode(
      token,
      getJwtConfig(),
      getLocalDevConfig()
    );

    // 查找账户：优先使用 accountId，否则通过 OAuth 信息查找
    let accountId = authContext.accountId;
    if (!accountId) {
      const oauthProvider: OAuthProvider =
        (authContext.identityProvider?.name?.toLowerCase() as OAuthProvider) || 'cognito';
      const oauthSubject = authContext.identityProvider?.userId || authContext.cognitoUserId;
      let existingAccount = await getAccountByOAuth(oauthProvider, oauthSubject);
      // 兼容旧数据：之前可能用 'google' 作为默认 provider
      if (!existingAccount && oauthProvider === 'cognito') {
        existingAccount = await getAccountByOAuth('google', oauthSubject);
      }
      accountId = existingAccount?.accountId;
    }

    if (!accountId) {
      return error('Account not registered', 404);
    }

    // 解析请求体
    const body = JSON.parse(event.body || '{}');
    const input: UpdateAccountInput = {};

    if (body.displayName !== undefined) {
      input.displayName = body.displayName;
    }
    if (body.email !== undefined) {
      input.email = body.email;
    }
    if (body.avatarUrl !== undefined) {
      input.avatarUrl = body.avatarUrl;
    }

    const account = await updateAccount(accountId, input);

    return success({ account });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error updating account:', err);
    return error('Internal server error', 500);
  }
}

/**
 * GET /accounts/{accountId} - 获取指定用户（公开信息）
 */
export async function getAccount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const token = event.headers.Authorization || event.headers.authorization;
    await verifyAndExtractContextWithDevMode(token, getJwtConfig(), getLocalDevConfig());

    const accountId = event.pathParameters?.accountId;
    if (!accountId) {
      return error('accountId is required', 400);
    }

    const account = await getAccountById(accountId);
    if (!account) {
      return error('Account not found', 404);
    }

    // 只返回公开信息
    return success({
      account: {
        accountId: account.accountId,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        publicKey: account.publicKey,
        createdAt: account.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error getting account:', err);
    return error('Internal server error', 500);
  }
}
