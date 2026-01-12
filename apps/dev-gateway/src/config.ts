/**
 * Configuration Loader
 *
 * 从命令行参数、环境变量和配置文件加载配置
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GatewayConfig, RouteConfig } from './types';

/**
 * 默认路由配置 - 与 AWS API Gateway 保持一致
 */
const DEFAULT_ROUTES: RouteConfig[] = [
  // HTTP API 路由 - AutomataApiFunction
  { type: 'http', method: 'GET', path: '/health', function: 'automata-api', auth: false },
  { type: 'http', method: 'GET', path: '/v1/health', function: 'automata-api', auth: false },

  // Account 路由
  { type: 'http', method: 'ANY', path: '/v1/accounts/me', function: 'automata-api' },
  { type: 'http', method: 'ANY', path: '/v1/accounts', function: 'automata-api' },
  { type: 'http', method: 'ANY', path: '/v1/accounts/{accountId}', function: 'automata-api' },

  // Automata 路由
  { type: 'http', method: 'ANY', path: '/v1/accounts/{accountId}/automatas', function: 'automata-api' },
  { type: 'http', method: 'ANY', path: '/v1/accounts/{accountId}/automatas/{automataId}', function: 'automata-api' },
  { type: 'http', method: 'ANY', path: '/v1/accounts/{accountId}/automatas/{automataId}/state', function: 'automata-api' },

  // Event 路由
  { type: 'http', method: 'ANY', path: '/v1/accounts/{accountId}/automatas/{automataId}/events', function: 'automata-api' },

  // WebSocket Token 路由
  { type: 'http', method: 'POST', path: '/v1/ws/token', function: 'automata-api' },

  // WebSocket 路由 - AutomataWsFunction
  { type: 'websocket', path: '/', function: 'automata-ws' },
];

/**
 * 默认配置
 */
const DEFAULT_CONFIG: GatewayConfig = {
  port: 3000,
  lambdaMode: 'direct',
  remoteEndpoint: 'http://127.0.0.1:3001', // sam local start-lambda 端口
  jwt: {
    mode: 'local',
    issuer: 'local-dev',
  },
  functions: {
    httpApi: 'functions/automata-api/src/index.ts',
    websocket: 'functions/automata-ws/src/index.ts',
  },
  sam: {
    templatePath: 'merged-template.yaml',
    envVarsPath: 'env.json',
    httpApiFunctionName: 'AutomataApiFunction',
    websocketFunctionName: 'AutomataWsFunction',
  },
  routes: DEFAULT_ROUTES,
};

/**
 * 部分 JWT 配置（用于命令行和环境变量覆盖）
 */
type PartialJwtConfig = {
  mode?: 'jwks' | 'local' | 'none';
  jwksUrl?: string;
  localPublicKey?: string;
  issuer?: string;
  audience?: string;
};

/**
 * 部分网关配置（用于合并）
 */
type PartialGatewayConfig = Omit<Partial<GatewayConfig>, 'jwt'> & {
  jwt?: PartialJwtConfig;
};

/**
 * 解析命令行参数
 */
export function parseArgs(argv: string[]): PartialGatewayConfig {
  const config: PartialGatewayConfig = {
    jwt: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--port':
      case '-p':
        config.port = parseInt(argv[++i], 10);
        break;

      // 向后兼容
      case '--http-port':
      case '--ws-port':
        config.port = parseInt(argv[++i], 10);
        break;

      case '--mode':
      case '-m':
        config.lambdaMode = argv[++i] as 'direct' | 'sam' | 'remote';
        break;

      case '--remote-endpoint':
        config.remoteEndpoint = argv[++i];
        break;

      case '--jwt-mode':
        config.jwt!.mode = argv[++i] as 'jwks' | 'local' | 'none';
        break;

      case '--jwks-url':
        config.jwt!.jwksUrl = argv[++i];
        break;

      case '--jwt-public-key':
        config.jwt!.localPublicKey = argv[++i];
        break;

      case '--jwt-issuer':
        config.jwt!.issuer = argv[++i];
        break;

      case '--config':
        // 配置文件由 loadConfig 处理
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

/**
 * 从环境变量加载配置
 */
function loadEnvConfig(): PartialGatewayConfig {
  const config: PartialGatewayConfig = {
    jwt: {},
  };

  if (process.env.DEV_GATEWAY_PORT) {
    config.port = parseInt(process.env.DEV_GATEWAY_PORT, 10);
  }

  // 向后兼容
  if (process.env.DEV_GATEWAY_WS_PORT) {
    config.port = parseInt(process.env.DEV_GATEWAY_WS_PORT, 10);
  }

  if (process.env.DEV_GATEWAY_HTTP_PORT) {
    config.port = parseInt(process.env.DEV_GATEWAY_HTTP_PORT, 10);
  }

  if (process.env.DEV_GATEWAY_MODE) {
    config.lambdaMode = process.env.DEV_GATEWAY_MODE as 'direct' | 'sam' | 'remote';
  }

  if (process.env.DEV_GATEWAY_REMOTE_ENDPOINT) {
    config.remoteEndpoint = process.env.DEV_GATEWAY_REMOTE_ENDPOINT;
  }

  if (process.env.DEV_GATEWAY_JWT_MODE) {
    config.jwt!.mode = process.env.DEV_GATEWAY_JWT_MODE as 'jwks' | 'local' | 'none';
  }

  if (process.env.DEV_GATEWAY_JWKS_URL) {
    config.jwt!.jwksUrl = process.env.DEV_GATEWAY_JWKS_URL;
  }

  if (process.env.LOCAL_JWT_PUBLIC_KEY) {
    config.jwt!.localPublicKey = process.env.LOCAL_JWT_PUBLIC_KEY;
  }

  if (process.env.LOCAL_JWT_ISSUER) {
    config.jwt!.issuer = process.env.LOCAL_JWT_ISSUER;
  }

  return config;
}

/**
 * 从 env.json 加载 Lambda 环境变量（用于 direct 模式）
 */
async function loadLambdaEnvVars(rootDir: string): Promise<void> {
  const envPath = path.join(rootDir, 'env.json');

  try {
    const content = await fs.readFile(envPath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, Record<string, string>>;

    // 合并 AutomataApiFunction 和 AutomataWsFunction 的环境变量
    const sources = ['AutomataApiFunction', 'AutomataWsFunction'];

    for (const source of sources) {
      const envVars = parsed[source];
      if (envVars) {
        for (const [key, value] of Object.entries(envVars)) {
          if (typeof value === 'string') {
            // 本地运行时把 host.docker.internal 替换为 localhost
            process.env[key] = value.replace(/host\.docker\.internal/g, 'localhost');
          }
        }
      }
    }
  } catch {
    // 文件不存在或解析失败
  }
}

/**
 * 从 env.json 加载 JWT 公钥和 DynamoDB 配置
 */
async function loadJwtFromEnvJson(rootDir: string): Promise<{
  publicKey?: string;
  issuer?: string;
  dynamodbEndpoint?: string;
}> {
  const envPath = path.join(rootDir, 'env.json');

  try {
    const content = await fs.readFile(envPath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, any>;

    // 尝试从 E2ETests 或其他函数配置中读取
    const sources = [
      parsed.E2ETests,
      parsed.AutomataApiFunction,
      parsed.AutomataWsFunction,
    ];

    for (const source of sources) {
      if (source?.LOCAL_JWT_PUBLIC_KEY) {
        return {
          publicKey: source.LOCAL_JWT_PUBLIC_KEY,
          issuer: source.LOCAL_JWT_ISSUER || 'local-dev',
          dynamodbEndpoint: source.DYNAMODB_ENDPOINT,
        };
      }
    }
  } catch {
    // 文件不存在或解析失败
  }

  return {};
}

/**
 * 加载完整配置
 */
export async function loadConfig(rootDir: string, argv: string[]): Promise<GatewayConfig> {
  // 1. 从默认配置开始
  let config: GatewayConfig = { ...DEFAULT_CONFIG, routes: [...DEFAULT_ROUTES] };

  // 2. 先解析命令行参数，判断是否需要加载 Lambda 环境变量
  const argsConfig = parseArgs(argv);
  const targetMode = argsConfig.lambdaMode || process.env.DEV_GATEWAY_MODE || 'direct';

  // 3. 如果是 direct 模式，从 env.json 加载所有 Lambda 环境变量
  if (targetMode === 'direct') {
    await loadLambdaEnvVars(rootDir);
  }

  // 4. 从 env.json 加载 JWT 配置
  const envJsonConfig = await loadJwtFromEnvJson(rootDir);
  if (envJsonConfig.publicKey) {
    config.jwt.localPublicKey = envJsonConfig.publicKey;
    // 同时设置环境变量供 Lambda 使用
    process.env.LOCAL_JWT_PUBLIC_KEY = envJsonConfig.publicKey;
  }
  if (envJsonConfig.issuer) {
    config.jwt.issuer = envJsonConfig.issuer;
    process.env.LOCAL_JWT_ISSUER = envJsonConfig.issuer;
  }

  // 设置环境变量供 Lambda 使用（向后兼容）
  if (envJsonConfig.dynamodbEndpoint && targetMode === 'direct') {
    // 本地运行时使用 localhost
    process.env.DYNAMODB_ENDPOINT = envJsonConfig.dynamodbEndpoint.replace('host.docker.internal', 'localhost');
    process.env.DYNAMODB_TABLE_NAME = 'automabase-dev';
    process.env.AUTOMABASE_TABLE = 'automabase-dev';
  }

  // 设置 WebSocket API endpoint
  process.env.WEBSOCKET_API_ENDPOINT = `http://localhost:${config.port}`;

  // 5. 从环境变量加载
  const envConfig = loadEnvConfig();
  config = mergeConfig(config, envConfig);

  // 6. 应用命令行参数（最高优先级）
  config = mergeConfig(config, argsConfig);

  return config;
}

/**
 * 合并配置
 */
function mergeConfig(base: GatewayConfig, override: PartialGatewayConfig): GatewayConfig {
  return {
    ...base,
    ...override,
    jwt: {
      ...base.jwt,
      ...(override.jwt || {}),
    },
    functions: {
      ...base.functions,
      ...(override.functions || {}),
    },
    sam: base.sam && override.sam
      ? { ...base.sam, ...override.sam }
      : (override.sam || base.sam),
    routes: override.routes ?? base.routes,
  };
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
Dev Gateway - Unified Local Development Gateway for AWS Lambda

Usage:
  bun run apps/dev-gateway/src/index.ts [options]

Options:
  -p, --port <port>      Gateway port (default: 3001)
  -m, --mode <mode>      Lambda invoke mode: direct | sam | remote (default: direct)
  --remote-endpoint <url> Remote Lambda endpoint (for mode=remote)

JWT Options:
  --jwt-mode <mode>      JWT verification mode: jwks | local | none (default: local)
  --jwks-url <url>       JWKS endpoint URL (for jwt-mode=jwks)
  --jwt-public-key <pem> Local JWT public key PEM (for jwt-mode=local)
  --jwt-issuer <issuer>  Expected JWT issuer (default: local-dev)

Environment Variables:
  DEV_GATEWAY_PORT            Gateway port
  DEV_GATEWAY_MODE            Lambda invoke mode
  DEV_GATEWAY_JWT_MODE        JWT verification mode
  LOCAL_JWT_PUBLIC_KEY        Local JWT public key PEM
  LOCAL_JWT_ISSUER            Expected JWT issuer

Examples:
  # Start with default settings (direct mode, local JWT)
  bun run apps/dev-gateway/src/index.ts

  # Start with custom port
  bun run apps/dev-gateway/src/index.ts -p 8080

  # Start with SAM mode
  bun run apps/dev-gateway/src/index.ts --mode sam

  # Start with JWKS verification
  bun run apps/dev-gateway/src/index.ts --jwt-mode jwks --jwks-url https://cognito-idp...
`);
}
