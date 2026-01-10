/**
 * Local JWT Signer/Verifier
 *
 * 用于本地开发测试的 JWT 签发和验证
 * 使用 Ed25519 (EdDSA) 算法，与 Cognito 的 RS256 不同但同样安全
 */

import { SignJWT, jwtVerify, importPKCS8, importSPKI, exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import type { AuthContext } from '../types/cognito';

/**
 * 本地 JWT 配置
 */
export interface LocalJwtConfig {
  /** Ed25519 私钥 (PEM 格式, PKCS8) */
  privateKey: string;

  /** Ed25519 公钥 (PEM 格式, SPKI) */
  publicKey: string;

  /** Token 过期时间（数字秒数或字符串如 '1h', '30m'），默认 '1h' */
  expiresIn?: number | string;

  /** Issuer，默认 'local-dev' */
  issuer?: string;
}

/**
 * 本地 JWT Payload
 */
export interface LocalJwtPayload {
  /** Subject (用户标识) */
  sub: string;

  /** Account ID */
  accountId?: string;

  /** Email */
  email?: string;

  /** Display Name */
  name?: string;

  /** Avatar URL */
  picture?: string;

  /** Session Public Key (Base64URL Ed25519) */
  spk?: string;

  /** Identity Provider */
  idp?: {
    name: string;
    userId: string;
  };
}

/**
 * 生成 Ed25519 密钥对
 *
 * @returns PEM 格式的私钥和公钥
 */
export async function generateLocalKeyPair(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });

  const privateKeyPem = await exportPKCS8(privateKey);
  const publicKeyPem = await exportSPKI(publicKey);

  return {
    privateKey: privateKeyPem,
    publicKey: publicKeyPem,
  };
}

/**
 * 签发本地 JWT
 *
 * @param payload - JWT 负载
 * @param config - 配置
 * @returns 签名的 JWT
 */
export async function signLocalJwt(
  payload: LocalJwtPayload,
  config: LocalJwtConfig
): Promise<string> {
  const privateKey = await importPKCS8(config.privateKey, 'EdDSA');
  const issuer = config.issuer || 'local-dev';
  const expiresIn = config.expiresIn || '1h';

  // 格式化过期时间：如果是数字则加 's' 后缀，否则直接使用字符串
  const expirationTime = typeof expiresIn === 'number' ? `${expiresIn}s` : expiresIn;

  const jwt = await new SignJWT({
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    'custom:account_id': payload.accountId,
    'custom:spk': payload.spk,
    identities: payload.idp
      ? [{ providerName: payload.idp.name, userId: payload.idp.userId }]
      : undefined,
    // 兼容 Cognito 格式
    token_use: 'id',
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .setIssuer(issuer)
    .sign(privateKey);

  return jwt;
}

/**
 * 验证本地 JWT
 *
 * @param token - JWT token
 * @param config - 配置（需要公钥）
 * @returns 验证后的 payload
 */
export async function verifyLocalJwt(
  token: string,
  config: Pick<LocalJwtConfig, 'publicKey' | 'issuer'>
): Promise<LocalJwtPayload & { iat: number; exp: number }> {
  const publicKey = await importSPKI(config.publicKey, 'EdDSA');
  const issuer = config.issuer || 'local-dev';

  const { payload } = await jwtVerify(token, publicKey, {
    issuer,
  });

  return {
    sub: payload.sub as string,
    accountId: payload['custom:account_id'] as string | undefined,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
    spk: payload['custom:spk'] as string | undefined,
    idp: (payload.identities as Array<{ providerName: string; userId: string }> | undefined)?.[0]
      ? {
          name: (payload.identities as Array<{ providerName: string; userId: string }>)[0].providerName,
          userId: (payload.identities as Array<{ providerName: string; userId: string }>)[0].userId,
        }
      : undefined,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}

/**
 * 从本地 JWT 提取 AuthContext
 * 
 * 支持两种格式：
 * 1. LocalJwtPayload 格式（使用 accountId, spk, idp）
 * 2. 原始 JWT claims 格式（使用 custom:account_id, custom:spk, identities）
 */
export function extractAuthContextFromLocalJwt(
  payload: LocalJwtPayload | Record<string, unknown>
): AuthContext {
  // 支持两种格式的 accountId
  const accountId = (payload as LocalJwtPayload).accountId 
    || (payload as Record<string, unknown>)['custom:account_id'] as string | undefined;
  
  // 支持两种格式的 spk
  const spk = (payload as LocalJwtPayload).spk 
    || (payload as Record<string, unknown>)['custom:spk'] as string | undefined;
  
  // 支持两种格式的 identities
  let idp: { name: string; userId: string } | undefined;
  if ((payload as LocalJwtPayload).idp) {
    idp = (payload as LocalJwtPayload).idp;
  } else {
    const identities = (payload as Record<string, unknown>).identities as Array<{ providerName: string; userId: string }> | undefined;
    if (identities?.[0]) {
      idp = {
        name: identities[0].providerName,
        userId: identities[0].userId,
      };
    }
  }

  return {
    cognitoUserId: payload.sub as string,
    accountId,
    email: payload.email as string | undefined,
    displayName: payload.name as string | undefined,
    avatarUrl: payload.picture as string | undefined,
    sessionPublicKey: spk,
    identityProvider: idp,
  };
}

/**
 * 本地 JWT 验证错误
 */
export class LocalJwtError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'LocalJwtError';
  }
}
