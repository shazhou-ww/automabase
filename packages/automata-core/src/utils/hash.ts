/**
 * Hash utilities for Automabase
 * 
 * - MurmurHash3-128: 用于 Account ID 生成
 * - xxHash64: 用于 Blueprint ID 生成（未来实现）
 */

import murmurhash3 from 'murmurhash3js-revisited';
import { encodeBase62Buffer } from './base62';

/**
 * 使用 MurmurHash3-128 生成 Account ID
 * 
 * @param publicKey - Ed25519 公钥 (32 bytes)
 * @returns Base62 编码的 Account ID (约 22 字符)
 */
export function generateAccountId(publicKey: Uint8Array | Buffer): string {
  // MurmurHash3 x64 128-bit
  const hashResult = murmurhash3.x64.hash128(Buffer.from(publicKey));
  
  // hashResult 是 32 字符的十六进制字符串
  const hashBuffer = Buffer.from(hashResult, 'hex');
  
  return encodeBase62Buffer(hashBuffer);
}

/**
 * 从 Base64URL 编码的公钥生成 Account ID
 */
export function generateAccountIdFromBase64(publicKeyBase64: string): string {
  const publicKey = Buffer.from(publicKeyBase64, 'base64url');
  return generateAccountId(publicKey);
}

/**
 * 验证公钥格式
 * Ed25519 公钥应该是 32 bytes
 */
export function validatePublicKey(publicKey: Uint8Array | Buffer): boolean {
  return publicKey.length === 32;
}

/**
 * 验证 Base64URL 编码的公钥格式
 */
export function validateBase64PublicKey(publicKeyBase64: string): boolean {
  try {
    const decoded = Buffer.from(publicKeyBase64, 'base64url');
    return validatePublicKey(decoded);
  } catch {
    return false;
  }
}

