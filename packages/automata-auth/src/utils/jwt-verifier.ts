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
  constructor(
    message: string,
    public readonly code: string
  ) {
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

  // biome-ignore lint/style/noNonNullAssertion: jwksCache.has(issuer) guarantees the value exists
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
      throw new JwtVerificationError('Invalid token_use: expected "id"', 'INVALID_TOKEN_USE');
    }

    return payload as unknown as CognitoIdTokenClaims;
  } catch (error) {
    if (error instanceof JwtVerificationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new JwtVerificationError(`JWT verification failed: ${message}`, 'VERIFICATION_FAILED');
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
 * 本地 JWT 验证配置
 *
 * 如果提供了 localPublicKey，则使用本地 JWT 验证（bypass Cognito）
 */
export interface LocalDevConfig {
  /** 是否启用本地 JWT 验证（基于 localPublicKey 是否存在） */
  enabled: boolean;

  /** 本地 JWT 公钥 (PEM 格式) */
  localPublicKey?: string;

  /** 本地 JWT Issuer，默认 'local-dev' */
  localIssuer?: string;
}

import { extractAuthContextFromLocalJwt, verifyLocalJwt } from './local-jwt';

/**
 * 验证 JWT 并提取用户上下文（支持本地 JWT 模式）
 *
 * 如果配置了 LOCAL_JWT_PUBLIC_KEY，则使用本地 JWT 验证
 * 否则使用 Cognito JWT 验证
 */
export async function verifyAndExtractContextWithDevMode(
  token: string | undefined,
  config: JwtVerifierConfig,
  localDev: LocalDevConfig
): Promise<AuthContext> {
  // 本地 JWT 模式（配置了 localPublicKey）
  if (localDev.enabled && localDev.localPublicKey) {
    if (!token) {
      throw new JwtVerificationError('Missing Authorization header', 'MISSING_AUTH_HEADER');
    }

    const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;

    try {
      const payload = await verifyLocalJwt(actualToken, {
        publicKey: localDev.localPublicKey,
        issuer: localDev.localIssuer || 'local-dev',
      });

      console.log('[LOCAL_JWT] Verified local JWT for:', payload.sub);
      return extractAuthContextFromLocalJwt(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new JwtVerificationError(
        `Local JWT verification failed: ${message}`,
        'LOCAL_JWT_VERIFICATION_FAILED'
      );
    }
  }

  // 正常验证流程
  if (!token) {
    throw new JwtVerificationError('Missing Authorization header', 'MISSING_AUTH_HEADER');
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
    throw new JwtVerificationError('Missing Authorization header', 'MISSING_AUTH_HEADER');
  }

  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new JwtVerificationError('Invalid Authorization header format', 'INVALID_AUTH_FORMAT');
  }

  return parts[1];
}
