# Dev Gateway

本地开发网关，用于模拟 AWS API Gateway 的行为。

## 功能

- **HTTP API Gateway**: 代理所有 REST API 请求到 Lambda
- **WebSocket API Gateway**: 处理 `$connect`、`$disconnect`、`$default` 路由
- **JWT 验证**: 支持 JWKS、本地公钥、跳过验证三种模式
- **Lambda 调用**: 支持直接调用、SAM Local、远程调用三种模式
- **Management API**: 支持 `PostToConnection` 向 WebSocket 客户端推送消息

## 快速开始

```bash
# 确保 DynamoDB Local 已启动
bun run setup:db

# 启动 Dev Gateway（默认模式：direct + local JWT）
bun run dev:gateway

# 或者使用 SAM 模式
bun run dev:gateway:sam
```

## 配置选项

### 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--http-port <port>` | HTTP API 端口 | 3201 |
| `--ws-port <port>` | WebSocket 端口 | 3201 |
| `--mode <mode>` | Lambda 调用模式: `direct` / `sam` / `remote` | direct |
| `--remote-endpoint <url>` | 远程 Lambda 端点 (mode=remote) | - |
| `--jwt-mode <mode>` | JWT 验证模式: `jwks` / `local` / `none` | local |
| `--jwks-url <url>` | JWKS 端点 URL (jwt-mode=jwks) | - |
| `--jwt-public-key <pem>` | 本地公钥 PEM (jwt-mode=local) | - |
| `--jwt-issuer <issuer>` | 期望的 JWT issuer | local-dev |

### 环境变量

| 变量 | 说明 |
|------|------|
| `DEV_GATEWAY_HTTP_PORT` | HTTP API 端口 |
| `DEV_GATEWAY_WS_PORT` | WebSocket 端口 |
| `DEV_GATEWAY_MODE` | Lambda 调用模式 |
| `DEV_GATEWAY_JWT_MODE` | JWT 验证模式 |
| `LOCAL_JWT_PUBLIC_KEY` | 本地公钥 PEM |
| `LOCAL_JWT_ISSUER` | JWT issuer |

## Lambda 调用模式

### Direct 模式（推荐本地开发）

直接 import Lambda handler 并调用，最快速度。

```bash
bun run dev:gateway --mode direct
```

### SAM 模式

通过 `sam local invoke` 调用，模拟真实 Lambda 环境（需要 Docker）。

```bash
bun run dev:gateway --mode sam
```

### Remote 模式

调用远程 Lambda 端点，用于测试已部署的环境。

```bash
bun run dev:gateway --mode remote --remote-endpoint https://xxx.execute-api.region.amazonaws.com
```

## JWT 验证模式

### Local 模式（推荐本地开发）

使用本地公钥验证 JWT，适合本地开发。公钥自动从 `env.json` 读取。

```bash
bun run dev:gateway --jwt-mode local
```

### JWKS 模式

从 JWKS 端点获取公钥验证 JWT，适合测试 Cognito 集成。

```bash
bun run dev:gateway --jwt-mode jwks --jwks-url https://cognito-idp.region.amazonaws.com/user-pool-id/.well-known/jwks.json
```

### None 模式

跳过 JWT 验证，仅用于测试。

```bash
bun run dev:gateway --jwt-mode none
```

## 测试

```bash
# 生成本地 JWT
bun run jwt:local --accountId acc_local_test_001 --refresh

# 运行 E2E 测试
bun run test:e2e
```

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                     Dev Gateway                          │
│                   (Unified Port 3001)                    │
├──────────────────────┬───────────────────────────────────┤
│   HTTP Gateway       │   WebSocket Gateway               │
├──────────────────────┴───────────────────────────────────┤
│                   JWT Verifier                           │
│         (JWKS / Local Public Key / None)                 │
├──────────────────────────────────────────────────────────┤
│                  Lambda Invoker                          │
│              (Direct / SAM / Remote)                     │
├──────────────────────────────────────────────────────────┤
│                  Lambda Functions                        │
│       automata-api           automata-ws                 │
└──────────────────────────────────────────────────────────┘
```

## Lambda 调用模式详解

| 模式 | 描述 | 速度 | 适用场景 |
|------|------|------|----------|
| `direct` | 直接在进程内调用 handler | 最快 | 快速开发迭代 |
| `remote` | 通过 HTTP 调用 `sam local start-lambda` | 快 | 需要完整 Lambda 环境 |
| `sam` | 每次 spawn `sam local invoke` | 慢 | 调试、单次测试 |

推荐使用 `remote` 模式配合 `bun run sam:local`：

```bash
# Terminal 1: 启动常驻 SAM Lambda 服务
bun run sam:local

# Terminal 2: 启动 dev-gateway
bun run dev:gateway:remote
```
