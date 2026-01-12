/**
 * JWT Verifier for Dev Gateway
 *
 * 支持多种验证模式：
 * - JWKS: 从远程 JWKS endpoint 获取公钥
 * - Local: 使用本地配置的公钥
 * - None: 跳过验证（仅用于测试）
 */

import * as crypto from 'node:crypto';
import type { JwtClaims, JwtConfig } from './types';

/**
 * Base64url 解码
 */
function base64urlDecode(input: string): Buffer {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  return Buffer.from(base64, 'base64');
}

/**
 * 解析 JWT（不验证签名）
 */
export function parseJwt(
  token: string
): { header: any; payload: JwtClaims; signature: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(base64urlDecode(parts[0]).toString('utf-8'));
    const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf-8')) as JwtClaims;
    const signature = parts[2];

    return { header, payload, signature };
  } catch {
    return null;
  }
}

/**
 * 验证 Ed25519 JWT 签名
 */
function verifyEd25519Signature(token: string, publicKeyPem: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const message = `${parts[0]}.${parts[1]}`;
    const signature = base64urlDecode(parts[2]);

    return crypto.verify(null, Buffer.from(message), publicKeyPem, signature);
  } catch (err) {
    console.error('[JWT] Signature verification error:', err);
    return false;
  }
}

/**
 * 验证 RSA JWT 签名
 */
function verifyRsaSignature(token: string, publicKeyPem: string, algorithm: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const message = `${parts[0]}.${parts[1]}`;
    const signature = base64urlDecode(parts[2]);

    // 映射 JWT 算法到 Node.js 算法
    const algoMap: Record<string, string> = {
      RS256: 'RSA-SHA256',
      RS384: 'RSA-SHA384',
      RS512: 'RSA-SHA512',
    };

    const nodeAlgo = algoMap[algorithm];
    if (!nodeAlgo) return false;

    const verifier = crypto.createVerify(nodeAlgo);
    verifier.update(message);
    return verifier.verify(publicKeyPem, signature);
  } catch (err) {
    console.error('[JWT] RSA signature verification error:', err);
    return false;
  }
}

/**
 * JWKS 缓存
 */
let jwksCache: { keys: any[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 小时

/**
 * 从 JWKS endpoint 获取公钥
 */
async function fetchJwks(jwksUrl: string): Promise<any[]> {
  // 检查缓存
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }

  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const data = (await response.json()) as { keys: any[] };
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

/**
 * 将 JWK 转换为 PEM 格式
 */
function jwkToPem(jwk: any): string {
  // 简化实现：只支持 RSA 和 Ed25519
  if (jwk.kty === 'RSA') {
    // RSA 需要更复杂的转换，这里使用 Node.js 内置功能
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return keyObject.export({ type: 'spki', format: 'pem' }) as string;
  }

  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return keyObject.export({ type: 'spki', format: 'pem' }) as string;
  }

  throw new Error(`Unsupported key type: ${jwk.kty}`);
}

/**
 * JWT 验证器
 */
export class JwtVerifier {
  constructor(private config: JwtConfig) {}

  /**
   * 验证 JWT 并返回 claims
   */
  async verify(token: string): Promise<JwtClaims | null> {
    // 解析 JWT
    const parsed = parseJwt(token);
    if (!parsed) {
      console.log('[JWT] Failed to parse token');
      return null;
    }

    const { header, payload } = parsed;

    // 检查过期
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      console.log('[JWT] Token expired');
      return null;
    }

    // 检查 issuer
    if (this.config.issuer && payload.iss !== this.config.issuer) {
      console.log(`[JWT] Invalid issuer: expected ${this.config.issuer}, got ${payload.iss}`);
      return null;
    }

    // 根据模式验证签名
    switch (this.config.mode) {
      case 'none':
        console.log('[JWT] Skipping signature verification (mode=none)');
        return payload;

      case 'local':
        return this.verifyWithLocalKey(token, header, payload);

      case 'jwks':
        return await this.verifyWithJwks(token, header, payload);

      default:
        console.log(`[JWT] Unknown verification mode: ${this.config.mode}`);
        return null;
    }
  }

  /**
   * 使用本地公钥验证
   */
  private verifyWithLocalKey(token: string, header: any, payload: JwtClaims): JwtClaims | null {
    if (!this.config.localPublicKey) {
      console.log('[JWT] Local public key not configured');
      return null;
    }

    let valid = false;
    if (header.alg === 'EdDSA') {
      valid = verifyEd25519Signature(token, this.config.localPublicKey);
    } else if (header.alg?.startsWith('RS')) {
      valid = verifyRsaSignature(token, this.config.localPublicKey, header.alg);
    } else {
      console.log(`[JWT] Unsupported algorithm: ${header.alg}`);
      return null;
    }

    if (!valid) {
      console.log('[JWT] Signature verification failed');
      return null;
    }

    console.log(`[JWT] Verified with local key for: ${payload.sub}`);
    return payload;
  }

  /**
   * 使用 JWKS 验证
   */
  private async verifyWithJwks(
    token: string,
    header: any,
    payload: JwtClaims
  ): Promise<JwtClaims | null> {
    if (!this.config.jwksUrl) {
      console.log('[JWT] JWKS URL not configured');
      return null;
    }

    try {
      const keys = await fetchJwks(this.config.jwksUrl);
      const key = keys.find((k) => k.kid === header.kid);

      if (!key) {
        console.log(`[JWT] Key not found in JWKS: ${header.kid}`);
        return null;
      }

      const pem = jwkToPem(key);
      let valid = false;

      if (header.alg === 'EdDSA') {
        valid = verifyEd25519Signature(token, pem);
      } else if (header.alg?.startsWith('RS')) {
        valid = verifyRsaSignature(token, pem, header.alg);
      } else {
        console.log(`[JWT] Unsupported algorithm: ${header.alg}`);
        return null;
      }

      if (!valid) {
        console.log('[JWT] JWKS signature verification failed');
        return null;
      }

      console.log(`[JWT] Verified with JWKS for: ${payload.sub}`);
      return payload;
    } catch (err) {
      console.error('[JWT] JWKS verification error:', err);
      return null;
    }
  }
}
