/**
 * Ed25519 签名验证工具
 *
 * 用于验证 Blueprint 签名
 */

import * as crypto from 'node:crypto';
import { canonicalize } from './hash';

/**
 * 验证 Ed25519 签名
 *
 * @param message - 原始消息（对象会被规范化为 JSON）
 * @param signature - Base64URL 编码的签名
 * @param publicKey - Base64URL 编码的 Ed25519 公钥
 * @returns 签名是否有效
 */
export function verifyEd25519Signature(
  message: unknown,
  signature: string,
  publicKey: string
): boolean {
  try {
    // 规范化消息
    const canonical = typeof message === 'string' ? message : canonicalize(message);

    // 解码签名和公钥
    const signatureBuffer = Buffer.from(signature, 'base64url');
    const publicKeyBuffer = Buffer.from(publicKey, 'base64url');

    // 创建 Ed25519 公钥对象
    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([
        // Ed25519 SPKI header (12 bytes)
        Buffer.from('302a300506032b6570032100', 'hex'),
        publicKeyBuffer,
      ]),
      format: 'der',
      type: 'spki',
    });

    // 验证签名
    return crypto.verify(null, Buffer.from(canonical), keyObject, signatureBuffer);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * 使用私钥签名消息（用于测试）
 *
 * @param message - 原始消息（对象会被规范化为 JSON）
 * @param privateKey - Base64URL 编码的 Ed25519 私钥 (64 bytes: 32 seed + 32 public)
 * @returns Base64URL 编码的签名
 */
export function signEd25519(message: unknown, privateKey: string): string {
  // 规范化消息
  const canonical = typeof message === 'string' ? message : canonicalize(message);

  // 解码私钥（取前 32 bytes 作为 seed）
  const privateKeyBuffer = Buffer.from(privateKey, 'base64url');
  const seed = privateKeyBuffer.slice(0, 32);

  // 创建 Ed25519 私钥对象
  const keyObject = crypto.createPrivateKey({
    key: Buffer.concat([
      // Ed25519 PKCS8 header for seed
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      seed,
    ]),
    format: 'der',
    type: 'pkcs8',
  });

  // 签名
  const signature = crypto.sign(null, Buffer.from(canonical), keyObject);

  return signature.toString('base64url');
}

/**
 * 生成 Ed25519 密钥对（用于测试）
 *
 * @returns { publicKey, privateKey } Base64URL 编码的密钥对
 */
export function generateEd25519KeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  // 导出公钥（取后 32 bytes）
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  const publicKeyRaw = publicKeyDer.slice(-32);

  // 导出私钥 seed（取后 32 bytes of seed portion）
  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const privateKeySeed = privateKeyDer.slice(-32);

  // 组合 seed + public key 形成完整私钥（64 bytes）
  const fullPrivateKey = Buffer.concat([privateKeySeed, publicKeyRaw]);

  return {
    publicKey: publicKeyRaw.toString('base64url'),
    privateKey: fullPrivateKey.toString('base64url'),
  };
}
