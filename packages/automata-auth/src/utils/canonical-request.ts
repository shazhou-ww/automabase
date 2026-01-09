/**
 * Canonical Request 构造
 *
 * 用于请求签名验证，确保请求内容未被篡改
 */

import * as crypto from 'node:crypto';

/**
 * 请求信息
 */
export interface RequestInfo {
  /** HTTP 方法 */
  method: string;

  /** 请求路径 */
  path: string;

  /** 查询参数 */
  queryParams?: Record<string, string | string[] | undefined>;

  /** 请求头 */
  headers: Record<string, string | undefined>;

  /** 请求体 */
  body?: string;
}

/**
 * 必须签名的请求头
 */
export const SIGNED_HEADERS = [
  'host',
  'x-request-id',
  'x-request-timestamp',
  'content-type',
] as const;

/**
 * 规范化查询字符串
 * 按键名排序，URL 编码
 */
export function canonicalizeQueryString(
  params?: Record<string, string | string[] | undefined>
): string {
  if (!params) return '';

  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .flatMap(([k, v]) => {
      if (Array.isArray(v)) {
        return v.map((val) => [k, val] as [string, string]);
      }
      return [[k, v as string]] as [string, string][];
    })
    .sort((a, b) => {
      const keyCompare = a[0].localeCompare(b[0]);
      if (keyCompare !== 0) return keyCompare;
      return a[1].localeCompare(b[1]);
    })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  return sorted;
}

/**
 * 规范化请求头
 * 只包含需要签名的头，键名小写，值 trim
 */
export function canonicalizeHeaders(
  headers: Record<string, string | undefined>
): { canonical: string; signedHeaders: string } {
  const normalizedHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SIGNED_HEADERS.includes(lowerKey as (typeof SIGNED_HEADERS)[number]) && value) {
      normalizedHeaders[lowerKey] = value.trim();
    }
  }

  // 按键名排序
  const sortedKeys = Object.keys(normalizedHeaders).sort();

  const canonical = sortedKeys.map((k) => `${k}:${normalizedHeaders[k]}`).join('\n');

  const signedHeaders = sortedKeys.join(';');

  return { canonical, signedHeaders };
}

/**
 * 计算请求体的 SHA256 哈希
 */
export function hashBody(body?: string): string {
  const content = body || '';
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 构造 Canonical Request
 *
 * 格式:
 * {HTTP-Method}\n
 * {Path}\n
 * {Query-String-Sorted}\n
 * {Canonical-Headers}\n
 * {Signed-Headers}\n
 * {Body-SHA256}
 */
export function buildCanonicalRequest(request: RequestInfo): string {
  const { method, path, queryParams, headers, body } = request;

  const canonicalQueryString = canonicalizeQueryString(queryParams);
  const { canonical: canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers);
  const bodyHash = hashBody(body);

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  return canonicalRequest;
}

/**
 * 计算 Canonical Request 的哈希值
 * 这是实际用于签名的字符串
 */
export function hashCanonicalRequest(canonicalRequest: string): string {
  return crypto.createHash('sha256').update(canonicalRequest).digest('hex');
}

/**
 * 构造并哈希 Canonical Request
 */
export function buildAndHashCanonicalRequest(request: RequestInfo): {
  canonicalRequest: string;
  hashedRequest: string;
} {
  const canonicalRequest = buildCanonicalRequest(request);
  const hashedRequest = hashCanonicalRequest(canonicalRequest);
  return { canonicalRequest, hashedRequest };
}

