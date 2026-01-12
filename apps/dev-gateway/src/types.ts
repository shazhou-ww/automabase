/**
 * Gateway Configuration Types
 */

/**
 * 路由配置 - 与 AWS API Gateway 保持一致
 */
export interface RouteConfig {
  /**
   * 路由类型
   */
  type: 'http' | 'websocket';

  /**
   * HTTP 方法 (仅 HTTP 路由)
   */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'ANY';

  /**
   * 路径模板，支持 {param} 参数
   */
  path: string;

  /**
   * Lambda 函数路径或名称
   */
  function: string;

  /**
   * 是否需要认证（默认 true）
   */
  auth?: boolean;
}

export interface GatewayConfig {
  /**
   * 网关端口（统一端口，同时处理 HTTP 和 WebSocket）
   */
  port: number;

  /**
   * HTTP API 端口（已废弃，保留兼容）
   * @deprecated 使用 port
   */
  httpPort?: number;

  /**
   * WebSocket API 端口（已废弃，保留兼容）
   * @deprecated 使用 port
   */
  wsPort?: number;

  /**
   * Lambda 调用模式
   * - 'direct': 直接 import 并调用 handler（最快，用于本地开发）
   * - 'sam': 通过 sam local invoke 调用（模拟真实 Lambda 环境）
   * - 'remote': 调用远程 Lambda endpoint（用于测试远程环境）
   */
  lambdaMode: 'direct' | 'sam' | 'remote';

  /**
   * 远程 Lambda endpoint（仅在 lambdaMode === 'remote' 时使用）
   */
  remoteEndpoint?: string;

  /**
   * JWT 验证配置
   */
  jwt: JwtConfig;

  /**
   * Lambda 函数路径配置
   */
  functions: FunctionPaths;

  /**
   * SAM 配置（仅在 lambdaMode === 'sam' 时使用）
   */
  sam?: SamConfig;

  /**
   * 路由配置
   */
  routes: RouteConfig[];
}

export interface JwtConfig {
  /**
   * JWT 验证模式
   * - 'jwks': 使用 JWKS endpoint 验证（生产环境）
   * - 'local': 使用本地公钥验证（本地开发）
   * - 'none': 跳过验证（仅用于测试）
   */
  mode: 'jwks' | 'local' | 'none';

  /**
   * JWKS endpoint URL（仅在 mode === 'jwks' 时使用）
   */
  jwksUrl?: string;

  /**
   * 本地公钥 PEM（仅在 mode === 'local' 时使用）
   */
  localPublicKey?: string;

  /**
   * JWT issuer（用于验证 iss claim）
   */
  issuer?: string;

  /**
   * JWT audience（用于验证 aud claim）
   */
  audience?: string;
}

export interface FunctionPaths {
  /**
   * HTTP API Lambda 函数路径
   */
  httpApi: string;

  /**
   * WebSocket Lambda 函数路径
   */
  websocket: string;
}

export interface SamConfig {
  /**
   * SAM 模板文件路径
   */
  templatePath: string;

  /**
   * 环境变量文件路径
   */
  envVarsPath: string;

  /**
   * HTTP API 函数名
   */
  httpApiFunctionName: string;

  /**
   * WebSocket 函数名
   */
  websocketFunctionName: string;
}

/**
 * Lambda 事件类型
 */
export interface LambdaHttpEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  queryStringParameters: Record<string, string | undefined> | null;
  pathParameters: Record<string, string | undefined> | null;
  body: string | null;
  isBase64Encoded: boolean;
  requestContext: {
    requestId: string;
    stage: string;
    authorizer?: {
      claims?: Record<string, any>;
    };
  };
}

export interface LambdaWsEvent {
  requestContext: {
    routeKey: string;
    connectionId: string;
    eventType: 'CONNECT' | 'MESSAGE' | 'DISCONNECT';
    stage: string;
    requestId: string;
    domainName: string;
    authorizer?: {
      claims?: Record<string, any>;
    };
  };
  body?: string;
  queryStringParameters?: Record<string, string | undefined>;
  isBase64Encoded: boolean;
}

export interface LambdaResult {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
  isBase64Encoded?: boolean;
}

/**
 * JWT Claims
 */
export interface JwtClaims {
  sub: string;
  email?: string;
  name?: string;
  'custom:account_id'?: string;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
  [key: string]: any;
}
