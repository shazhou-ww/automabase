/**
 * Cognito JWT Verifier
 * 
 * 使用 jose 库验证 Cognito JWT
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthContext, CognitoIdTokenClaims } from '../types/cognito';

/**
 * JWT 验证配置
 */
export interface JwtVerifierConfig {
  /** Cognito User Pool ID */
  userPoolId: string;
  
  /** AWS Region */
  region: string;
  
  /** Client ID (可选，用于验证 aud claim) */
  clientId?: string;
}

/**
 * JWT 验证错误
 */
export class JwtVerificationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'JwtVerificationError';
  }
}

// JWKS 缓存
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * 获取或创建 JWKS
 */
function getJwks(config: JwtVerifierConfig): ReturnType<typeof createRemoteJWKSet> {
  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
  
  if (!jwksCache.has(issuer)) {
    const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
    jwksCache.set(issuer, createRemoteJWKSet(jwksUrl));
  }
  
  return jwksCache.get(issuer)!;
}

/**
 * 验证 Cognito ID Token
 */
export async function verifyIdToken(
  token: string,
  config: JwtVerifierConfig
): Promise<CognitoIdTokenClaims> {
  const issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
  const jwks = getJwks(config);
  
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: config.clientId,
    });
    
    // 验证 token_use
    if (payload.token_use !== 'id') {
      throw new JwtVerificationError(
        'Invalid token_use: expected "id"',
        'INVALID_TOKEN_USE'
      );
    }
    
    return payload as unknown as CognitoIdTokenClaims;
  } catch (error) {
    if (error instanceof JwtVerificationError) {
      throw error;
    }
    
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new JwtVerificationError(
      `JWT verification failed: ${message}`,
      'VERIFICATION_FAILED'
    );
  }
}

/**
 * 从 ID Token 提取用户上下文
 */
export function extractAuthContext(claims: CognitoIdTokenClaims): AuthContext {
  // 提取 IdP 信息
  let identityProvider: AuthContext['identityProvider'];
  if (claims.identities && claims.identities.length > 0) {
    const identity = claims.identities[0];
    identityProvider = {
      name: identity.providerName,
      userId: identity.userId,
    };
  }
  
  return {
    cognitoUserId: claims.sub,
    accountId: claims['custom:account_id'],
    email: claims.email,
    displayName: claims.name,
    avatarUrl: claims.picture,
    sessionPublicKey: claims['custom:spk'],
    identityProvider,
  };
}

/**
 * 验证 JWT 并提取用户上下文
 */
export async function verifyAndExtractContext(
  token: string,
  config: JwtVerifierConfig
): Promise<AuthContext> {
  const claims = await verifyIdToken(token, config);
  return extractAuthContext(claims);
}

/**
 * 本地开发模式配置
 */
export interface LocalDevConfig {
  /** 是否启用本地开发模式 */
  enabled: boolean;
  /** Mock 用户信息 */
  mockUser?: Partial<AuthContext>;
}

/**
 * 默认 Mock 用户
 */
const DEFAULT_MOCK_USER: AuthContext = {
  cognitoUserId: 'local-dev-user',
  accountId: undefined,
  email: 'dev@localhost',
  displayName: 'Local Dev User',
  avatarUrl: undefined,
  sessionPublicKey: undefined,
  identityProvider: {
    name: 'local',
    userId: 'local-dev-user',
  },
};

/**
 * 验证 JWT 并提取用户上下文（支持本地开发模式）
 * 
 * 当 LOCAL_DEV_MODE=true 时，跳过 JWT 验证并返回 mock 用户
 */
export async function verifyAndExtractContextWithDevMode(
  token: string | undefined,
  config: JwtVerifierConfig,
  localDev: LocalDevConfig
): Promise<AuthContext> {
  // 本地开发模式：跳过验证
  if (localDev.enabled) {
    console.log('[LOCAL_DEV_MODE] Skipping JWT verification, using mock user');
    return { ...DEFAULT_MOCK_USER, ...localDev.mockUser };
  }
  
  // 正常验证流程
  if (!token) {
    throw new JwtVerificationError(
      'Missing Authorization header',
      'MISSING_AUTH_HEADER'
    );
  }
  
  const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;
  const claims = await verifyIdToken(actualToken, config);
  return extractAuthContext(claims);
}

/**
 * 从 Authorization header 提取 Bearer token
 */
export function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw new JwtVerificationError(
      'Missing Authorization header',
      'MISSING_AUTH_HEADER'
    );
  }
  
  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new JwtVerificationError(
      'Invalid Authorization header format',
      'INVALID_AUTH_FORMAT'
    );
  }
  
  return parts[1];
}

