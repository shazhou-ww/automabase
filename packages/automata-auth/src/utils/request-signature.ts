/**
 * 请求签名验证
 *
 * 使用 Ed25519 验证请求的完整性和来源
 */

import { verify } from '@noble/ed25519';
import { buildAndHashCanonicalRequest, type RequestInfo } from './canonical-request';

/**
 * 签名验证错误
 */
export class SignatureVerificationError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

/**
 * 签名头格式
 * X-Signature: Algorithm=Ed25519, Signature={base64url-signature}
 */
export interface SignatureHeader {
  algorithm: string;
  signature: string;
}

/**
 * 解析签名头
 */
export function parseSignatureHeader(header: string | undefined): SignatureHeader {
  if (!header) {
    throw new SignatureVerificationError('Missing X-Signature header', 'MISSING_SIGNATURE');
  }

  const parts = header.split(',').map((p) => p.trim());
  const parsed: Record<string, string> = {};

  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    if (key && valueParts.length > 0) {
      parsed[key.trim().toLowerCase()] = valueParts.join('=').trim();
    }
  }

  if (!parsed.algorithm || !parsed.signature) {
    throw new SignatureVerificationError(
      'Invalid X-Signature format, expected: Algorithm=Ed25519, Signature={signature}',
      'INVALID_SIGNATURE_FORMAT'
    );
  }

  if (parsed.algorithm.toLowerCase() !== 'ed25519') {
    throw new SignatureVerificationError(
      `Unsupported signature algorithm: ${parsed.algorithm}`,
      'UNSUPPORTED_ALGORITHM'
    );
  }

  return {
    algorithm: parsed.algorithm,
    signature: parsed.signature,
  };
}

/**
 * Base64URL 解码
 */
function base64UrlDecode(str: string): Uint8Array {
  // 将 base64url 转换为标准 base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // 补全 padding
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 验证请求签名
 *
 * @param request - 请求信息
 * @param signatureHeader - X-Signature 头的值
 * @param publicKey - 签名者的公钥 (base64url 编码)
 * @returns 验证是否通过
 */
export async function verifyRequestSignature(
  request: RequestInfo,
  signatureHeader: string,
  publicKey: string
): Promise<boolean> {
  try {
    // 1. 解析签名头
    const { signature } = parseSignatureHeader(signatureHeader);

    // 2. 构造 Canonical Request
    const { hashedRequest } = buildAndHashCanonicalRequest(request);

    // 3. 解码签名和公钥
    const signatureBytes = base64UrlDecode(signature);
    const publicKeyBytes = base64UrlDecode(publicKey);

    // 4. 验证签名
    // 签名的内容是 Canonical Request 的 SHA256 哈希
    const messageBytes = new TextEncoder().encode(hashedRequest);
    const isValid = await verify(signatureBytes, messageBytes, publicKeyBytes);

    return isValid;
  } catch (error) {
    if (error instanceof SignatureVerificationError) {
      throw error;
    }
    throw new SignatureVerificationError(
      `Signature verification failed: ${(error as Error).message}`,
      'VERIFICATION_FAILED'
    );
  }
}

/**
 * 验证请求签名（带详细错误信息）
 */
export async function verifyRequestSignatureOrThrow(
  request: RequestInfo,
  signatureHeader: string,
  publicKey: string
): Promise<void> {
  const isValid = await verifyRequestSignature(request, signatureHeader, publicKey);

  if (!isValid) {
    throw new SignatureVerificationError('Invalid request signature', 'INVALID_SIGNATURE');
  }
}
