#!/usr/bin/env bun
/**
 * Dev Gateway - Unified Local Development Gateway for AWS Lambda
 *
 * 模拟 AWS API Gateway 的行为，用于本地开发和调试。
 * 在单一端口上同时处理 HTTP API 和 WebSocket API。
 *
 * 功能：
 * - HTTP API Gateway (REST API 代理)
 * - WebSocket API Gateway ($connect, $disconnect, $default 路由)
 * - JWT 验证 (JWKS / 本地公钥 / 跳过)
 * - Lambda 调用 (直接调用 / SAM / 远程)
 * - Management API (PostToConnection)
 *
 * Usage:
 *   bun run apps/dev-gateway/src/index.ts [options]
 *   bun run dev:gateway (via package.json)
 *
 * Options:
 *   -p, --port <port>    Gateway port (default: 3001)
 *   -m, --mode <mode>    Lambda mode: direct | sam | remote
 *   --jwt-mode <mode>    JWT mode: jwks | local | none
 *   -h, --help           Show help
 */

import * as path from 'node:path';
import { loadConfig } from './config';
import { JwtVerifier } from './jwt-verifier';
import { LambdaInvoker } from './lambda-invoker';
import { createUnifiedGateway, getActiveConnectionCount } from './unified-gateway';
import { clearLogs } from './timing-logger';

// 获取项目根目录
const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');

async function main() {
  console.log('🚀 Dev Gateway - Unified Local Development Gateway\n');

  // 加载配置
  const config = await loadConfig(ROOT_DIR, process.argv.slice(2));

  // 清空计时日志
  clearLogs();

  // 打印环境变量状态（调试）
  console.log('🔧 Environment:');
  console.log(`   DYNAMODB_ENDPOINT:     ${process.env.DYNAMODB_ENDPOINT || '(not set)'}`);
  console.log(`   AUTOMABASE_TABLE:      ${process.env.AUTOMABASE_TABLE || '(not set)'}`);
  console.log(`   LOCAL_JWT_PUBLIC_KEY:  ${process.env.LOCAL_JWT_PUBLIC_KEY ? '✓ set' : '(not set)'}`);
  console.log('');

  console.log('📋 Configuration:');
  console.log(`   Port:         ${config.port}`);
  console.log(`   Lambda Mode:  ${config.lambdaMode}`);
  console.log(`   JWT Mode:     ${config.jwt.mode}`);
  console.log(`   JWT Issuer:   ${config.jwt.issuer || '(not set)'}`);
  console.log(`   Routes:       ${config.routes.length} configured`);
  console.log('');

  // 创建 JWT 验证器
  const jwtVerifier = new JwtVerifier(config.jwt);

  // 创建 Lambda 调用器
  const lambdaInvoker = new LambdaInvoker(config);

  // 启动统一网关
  const server = createUnifiedGateway(config, jwtVerifier, lambdaInvoker);

  server.listen(config.port, () => {
    console.log(`✅ Unified Gateway listening on:`);
    console.log(`   HTTP API:       http://localhost:${config.port}`);
    console.log(`   WebSocket:      ws://localhost:${config.port}`);
    console.log(`   Management API: http://localhost:${config.port}/@connections/{connectionId}`);
    console.log('');
  });

  // 设置环境变量供 Lambda 使用
  process.env.WEBSOCKET_API_ENDPOINT = `http://localhost:${config.port}`;

  console.log('📝 Tips:');
  console.log(`   - All APIs unified on port ${config.port}`);
  console.log(`   - Generate local JWT: bun run jwt:local`);
  console.log(`   - Run E2E tests: bun run test:e2e`);
  console.log('');
  console.log('🔄 Press Ctrl+C to stop\n');

  // 定期打印状态
  setInterval(() => {
    const connections = getActiveConnectionCount();
    if (connections > 0) {
      console.log(`[Status] Active WebSocket connections: ${connections}`);
    }
  }, 60000);

  // 优雅关闭
  const shutdown = () => {
    console.log('\n👋 Shutting down...');
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
