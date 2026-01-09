/**
 * 安全中间件
 *
 * 集成 JWT 验证、请求签名验证、防重放保护
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { verifyAndExtractContextWithDevMode, type JwtVerifierConfig, type LocalDevConfig, type AuthContext } from '../utils/jwt-verifier';
import { buildAndHashCanonicalRequest, type RequestInfo } from '../utils/canonical-request';
import { verifyRequestSignatureOrThrow, SignatureVerificationError } from '../utils/request-signature';
import { validateAntiReplay, AntiReplayError, type AntiReplayConfig } from '../utils/anti-replay';

/**
 * 安全配置
 */
export interface SecurityConfig {
  /** JWT 验证配置 */
  jwt: JwtVerifierConfig;

  /** 本地开发配置 */
  localDev?: LocalDevConfig;

  /** 防重放配置 */
  antiReplay: AntiReplayConfig;

  /** 是否跳过签名验证（用于开发） */
  skipSignatureVerification?: boolean;

  /** 是否跳过防重放验证（用于开发） */
  skipAntiReplay?: boolean;
}

/**
 * 安全验证结果
 */
export interface SecurityResult {
  /** 认证上下文 */
  authContext: AuthContext;

  /** 请求信息（用于签名验证） */
  requestInfo: RequestInfo;
}

/**
 * 从 API Gateway 事件提取请求信息
 */
export function extractRequestInfo(event: APIGatewayProxyEvent): RequestInfo {
  // 规范化 headers
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(event.headers || {})) {
    headers[key.toLowerCase()] = value;
  }

  // 添加 host（如果没有）
  if (!headers.host) {
    headers.host = event.requestContext?.domainName || 'localhost';
  }

  return {
    method: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters as Record<string, string | undefined>,
    headers,
    body: event.body || undefined,
  };
}

/**
 * 获取公钥的函数类型
 */
export type GetPublicKeyFn = (accountId: string) => Promise<string | null>;

/**
 * 完整的安全验证
 *
 * 1. JWT 验证
 * 2. 请求签名验证（写操作）
 * 3. 防重放验证（写操作）
 *
 * @param event - API Gateway 事件
 * @param config - 安全配置
 * @param getPublicKey - 获取公钥的函数
 */
export async function validateSecurity(
  event: APIGatewayProxyEvent,
  config: SecurityConfig,
  getPublicKey: GetPublicKeyFn
): Promise<SecurityResult> {
  // 1. JWT 验证
  const token = event.headers.Authorization || event.headers.authorization;
  const authContext = await verifyAndExtractContextWithDevMode(
    token,
    config.jwt,
    config.localDev
  );

  // 2. 提取请求信息
  const requestInfo = extractRequestInfo(event);

  // 3. 判断是否为写操作
  const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    event.httpMethod.toUpperCase()
  );

  // 4. 写操作需要验证签名和防重放
  if (isWriteOperation) {
    // 4.1 验证签名
    if (!config.skipSignatureVerification) {
      if (!authContext.accountId) {
        throw new SignatureVerificationError(
          'Account not registered, cannot verify signature',
          'ACCOUNT_NOT_REGISTERED'
        );
      }

      const publicKey = await getPublicKey(authContext.accountId);
      if (!publicKey) {
        throw new SignatureVerificationError(
          'Public key not found for account',
          'PUBLIC_KEY_NOT_FOUND'
        );
      }

      const signatureHeader = event.headers['X-Signature'] || event.headers['x-signature'];
      await verifyRequestSignatureOrThrow(requestInfo, signatureHeader || '', publicKey);
    }

    // 4.2 防重放验证
    if (!config.skipAntiReplay && authContext.accountId) {
      const requestId = event.headers['X-Request-Id'] || event.headers['x-request-id'];
      const timestamp = event.headers['X-Request-Timestamp'] || event.headers['x-request-timestamp'];

      await validateAntiReplay(
        requestId,
        timestamp,
        authContext.accountId,
        config.antiReplay
      );
    }
  }

  return { authContext, requestInfo };
}

/**
 * 创建安全配置的工厂函数
 */
export function createSecurityConfig(options: {
  userPoolId: string;
  clientId: string;
  requestIdTableName: string;
  isLocalDev?: boolean;
}): SecurityConfig {
  const config: SecurityConfig = {
    jwt: {
      userPoolId: options.userPoolId,
      clientId: options.clientId,
      region: process.env.AWS_REGION || 'us-east-1',
    },
    antiReplay: {
      tableName: options.requestIdTableName,
      windowSeconds: 300, // 5 分钟
      ttlSeconds: 600,    // 10 分钟
    },
  };

  if (options.isLocalDev) {
    config.localDev = {
      enabled: true,
      defaultAccountId: 'local-dev-account',
    };
    config.skipSignatureVerification = true;
    config.skipAntiReplay = true;
  }

  return config;
}

// 导出错误类型
export { SignatureVerificationError, AntiReplayError };

