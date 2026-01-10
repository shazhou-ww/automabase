/**
 * Hash utilities for Automabase
 *
 * - MurmurHash3-128: 用于 Account ID 生成
 * - xxHash64: 用于 Blueprint ID 生成
 */

import murmurhash3 from 'murmurhash3js-revisited';
import { encodeBase62Buffer } from './base62';

// xxhash-wasm 需要异步初始化
let xxhashInstance: { h64ToString: (input: string) => string } | null = null;

async function getXxhash() {
  if (!xxhashInstance) {
    const xxhash = await import('xxhash-wasm');
    xxhashInstance = await xxhash.default();
  }
  return xxhashInstance;
}

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

/**
 * 规范化 JSON 对象（稳定排序的 JSON 字符串）
 * 用于生成可重复的 hash
 */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // 对对象的键进行排序
      return Object.keys(value)
        .sort()
        .reduce(
          (sorted, key) => {
            sorted[key] = value[key];
            return sorted;
          },
          {} as Record<string, unknown>
        );
    }
    return value;
  });
}

/**
 * 使用 xxHash64 计算 Blueprint 内容的 hash
 *
 * @param content - Blueprint 内容对象
 * @returns Base62 编码的 hash (约 11 字符)
 */
export async function computeBlueprintHash(content: unknown): Promise<string> {
  const canonical = canonicalize(content);
  const xxhash = await getXxhash();
  const hashHex = xxhash.h64ToString(canonical);

  // 将 16 字符的十六进制字符串转换为 Buffer
  const hashBuffer = Buffer.from(hashHex, 'hex');

  return encodeBase62Buffer(hashBuffer);
}

/**
 * 计算 Blueprint ID
 * 格式: {appId}:{name}:{hash}
 */
export async function computeBlueprintId(content: {
  appId: string;
  name: string;
}): Promise<string> {
  const hash = await computeBlueprintHash(content);
  return `${content.appId}:${content.name}:${hash}`;
}

