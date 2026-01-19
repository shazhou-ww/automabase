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
  getDeviceByPublicKey,
  getOrCreateAccountByOAuth,
  listActiveDevicesByAccountId,
  type OAuthProvider,
  type RegisterDeviceInput,
  registerDevice,
  revokeDevice,
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
 * Body: { publicKey?: string, deviceName?: string }
 *
 * 如果提供 publicKey 和 deviceName，会同时注册设备
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
    const { publicKey, deviceName } = body;

    // 确定 OAuth 信息（如果没有外部 IdP，使用 'cognito'）
    const oauthProvider: OAuthProvider =
      (authContext.identityProvider?.name?.toLowerCase() as OAuthProvider) || 'cognito';
    const oauthSubject = authContext.identityProvider?.userId || authContext.cognitoUserId;

    // 创建或获取账户
    const input: CreateAccountInput = {
      oauthProvider,
      oauthSubject,
      displayName: authContext.displayName || 'Anonymous',
      email: authContext.email,
      avatarUrl: authContext.avatarUrl,
    };

    const { account, isNew } = await getOrCreateAccountByOAuth(input);

    // 如果提供了 publicKey，同时注册设备
    let device = null;
    if (publicKey) {
      // 验证公钥格式
      if (!validateBase64PublicKey(publicKey)) {
        return error('Invalid publicKey format (expected 32-byte Ed25519 key in Base64URL)', 400);
      }

      // 检查设备是否已注册
      const existingDevice = await getDeviceByPublicKey(publicKey);
      if (existingDevice) {
        device = existingDevice;
      } else {
        // 注册新设备
        const deviceInput: RegisterDeviceInput = {
          accountId: account.accountId,
          publicKey,
          deviceName: deviceName || 'Default Device',
        };
        device = await registerDevice(deviceInput);
      }
    }

    return success({ account, device, isNew }, isNew ? 201 : 200);
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

/**
 * GET /accounts/me/devices - 列出当前用户的设备
 */
export async function listMyDevices(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const token = event.headers.Authorization || event.headers.authorization;
    const authContext = await verifyAndExtractContextWithDevMode(
      token,
      getJwtConfig(),
      getLocalDevConfig()
    );

    // 获取当前用户的 accountId
    let accountId = authContext.accountId;
    if (!accountId) {
      const oauthProvider: OAuthProvider =
        (authContext.identityProvider?.name?.toLowerCase() as OAuthProvider) || 'cognito';
      const oauthSubject = authContext.identityProvider?.userId || authContext.cognitoUserId;
      const account = await getAccountByOAuth(oauthProvider, oauthSubject);
      if (!account) {
        return error('Account not found', 404);
      }
      accountId = account.accountId;
    }

    const devices = await listActiveDevicesByAccountId(accountId);

    return success({ devices });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error listing devices:', err);
    return error('Internal server error', 500);
  }
}

/**
 * POST /accounts/me/devices - 注册新设备
 *
 * Body: { publicKey: string, deviceName: string, deviceType?: string }
 */
export async function registerMyDevice(
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
    const { publicKey, deviceName, deviceType } = body;

    if (!publicKey) {
      return error('publicKey is required', 400);
    }
    if (!deviceName) {
      return error('deviceName is required', 400);
    }

    // 验证公钥格式
    if (!validateBase64PublicKey(publicKey)) {
      return error('Invalid publicKey format (expected 32-byte Ed25519 key in Base64URL)', 400);
    }

    // 获取当前用户的 accountId
    let accountId = authContext.accountId;
    if (!accountId) {
      const oauthProvider: OAuthProvider =
        (authContext.identityProvider?.name?.toLowerCase() as OAuthProvider) || 'cognito';
      const oauthSubject = authContext.identityProvider?.userId || authContext.cognitoUserId;
      const account = await getAccountByOAuth(oauthProvider, oauthSubject);
      if (!account) {
        return error('Account not found. Please create an account first.', 404);
      }
      accountId = account.accountId;
    }

    // 检查公钥是否已被使用
    const existingDevice = await getDeviceByPublicKey(publicKey);
    if (existingDevice) {
      return error('This public key is already registered to a device', 409);
    }

    // 注册设备
    const input: RegisterDeviceInput = {
      accountId,
      publicKey,
      deviceName,
      deviceType,
    };
    const device = await registerDevice(input);

    return success({ device }, 201);
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error registering device:', err);
    return error('Internal server error', 500);
  }
}

/**
 * DELETE /accounts/me/devices/{deviceId} - 撤销设备
 */
export async function revokeMyDevice(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const token = event.headers.Authorization || event.headers.authorization;
    const authContext = await verifyAndExtractContextWithDevMode(
      token,
      getJwtConfig(),
      getLocalDevConfig()
    );

    const deviceId = event.pathParameters?.deviceId;
    if (!deviceId) {
      return error('deviceId is required', 400);
    }

    // 获取当前用户的 accountId
    let accountId = authContext.accountId;
    if (!accountId) {
      const oauthProvider: OAuthProvider =
        (authContext.identityProvider?.name?.toLowerCase() as OAuthProvider) || 'cognito';
      const oauthSubject = authContext.identityProvider?.userId || authContext.cognitoUserId;
      const account = await getAccountByOAuth(oauthProvider, oauthSubject);
      if (!account) {
        return error('Account not found', 404);
      }
      accountId = account.accountId;
    }

    const device = await revokeDevice(accountId, deviceId);

    return success({ device });
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return error(err.message, 401, err.code);
    }
    console.error('Error revoking device:', err);
    return error('Internal server error', 500);
  }
}
