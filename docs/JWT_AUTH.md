# JWT 认证与多租户架构文档

## 目录

- [概述](#概述)
- [架构设计](#架构设计)
- [JWT 格式规范](#jwt-格式规范)
- [租户注册流程](#租户注册流程)
- [API 认证流程](#api-认证流程)
- [本地测试指南](#本地测试指南)
- [环境变量配置](#环境变量配置)
- [常见问题](#常见问题)

## 概述

Automata API 使用 JWT (JSON Web Token) 进行多租户认证。每个租户使用自己的私钥签发 JWT token，
API 通过租户提供的 JWKS (JSON Web Key Set) endpoint 获取公钥来验证 token。

### 核心概念

- **租户 (Tenant)**: 独立的组织或客户，拥有自己的认证服务，使用 ULID 作为唯一标识符
- **用户 (User)**: 属于特定租户的用户，通过租户的认证服务获取 token
- **JWKS (JSON Web Key Set)**: 公钥集合，用于验证 JWT 签名
- **Automata**: 归属于特定租户和用户的有限状态机实例

### 认证流程

```
1. 租户注册 → 提供 JWKS URI 和 Issuer
2. 用户登录 → 租户认证服务签发 JWT token
3. 用户请求 → 携带 JWT token 访问 API
4. API 验证 → 从租户的 JWKS 获取公钥验证 token
5. 权限检查 → 验证用户是否有权访问该 automata
```

## 架构设计

### 多租户隔离

每个 automata 归属于特定的 `tenantId` + `userId` 组合：

```
AutomataTable:
  - pk: automataId
  - sk: "#META" | version
  - userId: 所有者 ID
  - tenantId: 租户 ID
  - gsi1pk: "TENANT#{tenantId}#USER#{userId}"  (用于查询)
  - gsi1sk: createdAt
```

### 认证架构

```
┌─────────────────────────────────────────────────────────┐
│              租户认证服务 (Tenant Auth Service)           │
│  - 管理租户用户                                           │
│  - 使用私钥签发 JWT token                                 │
│  - 提供 JWKS endpoint (公钥)                             │
└─────────────────────────────────────────────────────────┘
                    │
                    │ 签发 token
                    ▼
┌─────────────────────────────────────────────────────────┐
│              客户端 (Client)                             │
│  - 获取 JWT token                                        │
│  - 携带 token 访问 API                                    │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Authorization: Bearer <token>
                    ▼
┌─────────────────────────────────────────────────────────┐
│              Automata API                                │
│  1. 解析 token → 提取 tenant_id                          │
│  2. 查询租户配置 → 获取 jwksUri 和 issuer                │
│  3. 从 jwksUri 获取公钥 → 验证 token 签名                │
│  4. 验证 claims → issuer, audience, exp                  │
│  5. 检查权限 → userId 和 tenantId 匹配                   │
└─────────────────────────────────────────────────────────┘
```

### 数据存储

#### AutomataTable

存储 automata 数据和事件历史：

| pk (automataId) | sk | 字段 |
|----------------|-----|------|
| `01ARZ3...` | `#META` | `userId`, `tenantId`, `name`, `state`, `version`, ... |
| `01ARZ3...` | `000001` | `type`, `data`, `nextState`, `createdAt` |
| `01ARZ3...` | `000002` | `type`, `data`, `nextState`, `createdAt` |

#### TenantConfigTable (待实现)

存储租户的认证配置：

| pk (tenantId) | sk | 字段 |
|--------------|-----|------|
| `01ARZ3NDEKTSV4RRFFQ69G5FAV` | `#CONFIG` | `jwksUri`, `issuer`, `audience`, `createdAt` |

## JWT 格式规范

### 必需的 Claims

| Claim | 类型 | 说明 | 示例 |
|-------|------|------|------|
| `iss` | string | 租户的认证服务 URL（Issuer） | `https://tenant1.auth.example.com/` |
| `aud` | string | API 标识符（Audience） | `https://api.automabase.com` |
| `sub` | string | 用户唯一标识符（Subject） | `user123` |
| `exp` | number | Token 过期时间（Unix 时间戳） | `1735689600` |
| `tenant_id` | string | 租户 ID（ULID 格式，自定义 claim） | `01ARZ3NDEKTSV4RRFFQ69G5FAV` |

**注意**:

- `tenant_id` 必须使用 ULID 格式（26 个字符，如 `01ARZ3NDEKTSV4RRFFQ69G5FAV`）
- 当前版本不支持其他可选 claims（如 `iat`, `nbf`, `scope`, `email` 等）

### 签名算法

- **算法**: RS256 (RSA Signature with SHA-256)
- **密钥长度**: 至少 2048 位
- **公钥格式**: JWK (JSON Web Key) 格式
- **JWKS endpoint**: 必须提供标准的 JWKS endpoint

### JWT 示例

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "tenant-key-1"
  },
  "payload": {
    "iss": "https://tenant1.auth.example.com/",
    "aud": "https://api.automabase.com",
    "sub": "user123",
    "tenant_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "exp": 1735689600
  }
}
```

**说明**:

- `tenant_id` 使用 ULID 格式（26 个字符）
- 只包含必需的 claims，不包含可选字段

### JWKS 格式

租户必须提供符合 [RFC 7517](https://tools.ietf.org/html/rfc7517) 标准的 JWKS endpoint：

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "tenant-key-1",
      "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQmb...",
      "e": "AQAB"
    }
  ]
}
```

**JWKS endpoint 要求**:

- URL: `{issuer}/.well-known/jwks.json`（推荐）
- 或自定义路径，但必须在租户注册时提供完整 URL
- 必须支持 HTTPS（生产环境）
- 必须返回有效的 JSON 格式

## 租户注册流程

### 1. 租户准备

租户需要准备：

1. **认证服务**: 能够签发 JWT token 的服务
2. **RSA 密钥对**: 至少 2048 位的 RSA 密钥对
3. **JWKS endpoint**: 提供公钥的 HTTP(S) endpoint
4. **Issuer URL**: 认证服务的标识符

### 2. 注册 API（待实现）

```http
POST /tenants
Content-Type: application/json

{
  "tenantId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "jwksUri": "https://tenant1.auth.example.com/.well-known/jwks.json",
  "issuer": "https://tenant1.auth.example.com/",
  "audience": "https://api.automabase.com"
}
```

**注意**: `tenantId` 必须使用 ULID 格式。

### 3. 验证租户配置

注册时 API 会验证：

- JWKS endpoint 可访问
- JWKS 格式正确
- 至少包含一个有效的 RSA 公钥
- Issuer URL 格式正确

### 4. 存储配置

租户配置存储在 `TenantConfigTable`:

```typescript
{
  pk: "01ARZ3NDEKTSV4RRFFQ69G5FAV",  // ULID 格式的 tenantId
  sk: "#CONFIG",
  jwksUri: "https://tenant1.auth.example.com/.well-known/jwks.json",
  issuer: "https://tenant1.auth.example.com/",
  audience: "https://api.automabase.com",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
}
```

## API 认证流程

### REST API 认证

所有 REST API 请求都需要在 `Authorization` header 中携带 JWT token：

```http
GET /automata/{automataId}
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**验证步骤**:

1. 提取 token: 从 `Authorization: Bearer <token>` 提取
2. 解码 token: 获取 `tenant_id`（不验证签名）
3. 查询租户配置: 从 `TenantConfigTable` 获取 `jwksUri` 和 `issuer`
4. 获取公钥: 从 `jwksUri` 获取 JWKS，找到匹配的 `kid`
5. 验证签名: 使用公钥验证 token 签名
6. 验证 claims: 检查 `iss`, `aud`, `exp`, `tenant_id`
7. 权限检查: 验证用户是否有权访问该 automata

### WebSocket 认证

WebSocket 连接需要两步认证：

#### 1. 连接时验证（格式检查）

```javascript
// 连接 URL
wss://api.automabase.com/?token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

连接时只验证 token 格式和签名，不存储认证信息。

#### 2. 订阅时验证（实时验证）

```javascript
// 订阅消息
{
  "action": "subscribe",
  "automataId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

每次订阅都会实时验证 token，确保 token 未过期。

### 权限检查

所有操作都需要验证：

1. **租户匹配**: `token.tenant_id === automata.tenantId`
2. **用户匹配**: `token.sub === automata.userId`

只有 automata 的所有者（同一租户下的同一用户）才能访问。

## 本地测试指南

### 简化的本地 JWT 认证（推荐）

对于本地开发和 E2E 测试，推荐使用简化的 Ed25519 本地 JWT 认证，无需启动 JWKS 服务器：

#### 步骤 1: 生成密钥对

```bash
# 生成 Ed25519 密钥对并自动配置到 env.json
bun run keygen
```

这会：

- 生成 Ed25519 密钥对
- 将 `LOCAL_JWT_PUBLIC_KEY` 配置到各 Lambda 函数环境变量
- 将 `LOCAL_JWT_PRIVATE_KEY` 配置到 E2ETests 配置

#### 步骤 2: 在代码中签发本地 JWT

```typescript
import { signLocalJwt, generateLocalKeyPair } from '@automabase/automata-auth';

// 使用环境变量中的私钥签发 token
const token = await signLocalJwt(
  {
    sub: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
    accountId: 'my-account-id',
  },
  {
    privateKey: process.env.LOCAL_JWT_PRIVATE_KEY!,
    issuer: 'local-dev',
    expiresIn: '1h',
  }
);
```

#### 步骤 3: 启动本地 API

```bash
# 确保 env.json 已配置
bun run sam:local
```

服务端会自动使用 `LOCAL_JWT_PUBLIC_KEY` 验证 token。

#### 环境变量说明

| 变量 | 说明 |
|-----|------|
| `LOCAL_JWT_PUBLIC_KEY` | Ed25519 公钥 (PEM 格式)，用于验证 token。设置后自动使用本地 JWT 验证 |
| `LOCAL_JWT_PRIVATE_KEY` | Ed25519 私钥 (PEM 格式)，用于签发 token（E2E 测试用） |
| `LOCAL_JWT_ISSUER` | JWT issuer，默认 `local-dev` |

### 使用外部 JWKS 服务器（高级）

如需模拟生产环境的 JWKS 验证流程：

#### 前置要求

- Bun 1.0+
- Node.js 24.x（用于生成密钥）

### 步骤 1: 生成测试密钥对

```bash
# 生成 RSA 密钥对和 JWKS
bun run test:jwt:keys
```

这会生成：

- `.test-keys/private-key.json` - 私钥（用于签名）
- `.test-keys/public-key.json` - 公钥
- `.test-keys/jwks.json` - JWKS 格式的公钥

### 步骤 2: 启动本地 JWKS 服务器

```bash
# 在一个终端窗口启动
bun run test:jwks:server
```

服务器会在 `http://localhost:3002/.well-known/jwks.json` 提供 JWKS。

### 步骤 3: 生成测试 JWT Token

```bash
# 生成默认 token (userId: test-user-1, tenantId: ULID)
bun run test:jwt:token

# 生成自定义 token
bun run test:jwt:token <userId> <tenantId> <issuer> <audience>
```

示例：

```bash
# tenantId 使用 ULID 格式
bun run test:jwt:token user123 01ARZ3NDEKTSV4RRFFQ69G5FAV http://localhost:3002 https://api.automabase.com
```

输出：

```
✓ Test JWT Token generated:
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ...

Use it in requests:
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ...
```

### 步骤 4: 配置本地环境变量

编辑 `env.json`:

```json
{
  "Parameters": {
    "NODE_ENV": "development"
  },
  "AutomataFunction": {
    "JWKS_URI": "http://localhost:3002/.well-known/jwks.json",
    "JWT_ISSUER": "http://localhost:3002",
    "JWT_AUDIENCE": "https://api.automabase.com",
    "TENANT_ID_CLAIM": "tenant_id"
  },
  "AutomataTrackerFunction": {
    "JWKS_URI": "http://localhost:3002/.well-known/jwks.json",
    "JWT_ISSUER": "http://localhost:3002",
    "JWT_AUDIENCE": "https://api.automabase.com",
    "TENANT_ID_CLAIM": "tenant_id"
  }
}
```

### 步骤 5: 启动 SAM Local

```bash
# 构建函数
bun run build:functions

# 启动本地 API
bun run sam:local
```

### 步骤 6: 测试 API

```bash
# 使用生成的 token
TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5LTEifQ..."

# 创建 automata
curl -X POST http://localhost:3000/automata \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stateSchema": {"type": "object"},
    "eventSchemas": {"INCREMENT": {"type": "object"}},
    "initialState": {"count": 0},
    "transition": "$merge([state, {count: state.count + 1}])",
    "name": "Test Counter"
  }'

# 列出 automata
curl http://localhost:3000/automata \
  -H "Authorization: Bearer $TOKEN"
```

### 完整测试脚本

创建 `scripts/test-local.sh`:

```bash
#!/bin/bash

# 1. 生成密钥（如果不存在）
if [ ! -f ".test-keys/jwks.json" ]; then
  echo "Generating test keys..."
  bun run test:jwt:keys
fi

# 2. 启动 JWKS 服务器（后台）
echo "Starting JWKS server..."
bun run test:jwks:server &
JWKS_PID=$!

# 等待服务器启动
sleep 2

# 3. 生成测试 token（使用 ULID 作为 tenantId）
echo "Generating test token..."
TENANT_ID="01ARZ3NDEKTSV4RRFFQ69G5FAV"  # 使用 ULID
TOKEN=$(bun run test:jwt:token test-user-1 $TENANT_ID | tail -n 1)

echo ""
echo "✓ Test token generated:"
echo "$TOKEN"
echo ""
echo "Use it in requests:"
echo "curl -H 'Authorization: Bearer $TOKEN' http://localhost:3000/automata"
echo ""
echo "Press Ctrl+C to stop JWKS server"

# 等待
wait $JWKS_PID
```

## 环境变量配置

### Lambda 函数环境变量

每个 Lambda 函数需要以下环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `JWKS_URI` | 租户的 JWKS endpoint（生产环境）或本地测试 URI | `https://tenant1.auth.example.com/.well-known/jwks.json` |
| `JWT_ISSUER` | 租户的 Issuer URL（生产环境）或本地测试 issuer | `https://tenant1.auth.example.com/` |
| `JWT_AUDIENCE` | API 的 Audience 标识符 | `https://api.automabase.com` |
| `TENANT_ID_CLAIM` | JWT 中租户 ID 的 claim 名称（可选，默认 `tenant_id`） | `tenant_id` |

### 本地开发配置

`env.json` 示例：

```json
{
  "Parameters": {
    "NODE_ENV": "development"
  },
  "AutomataFunction": {
    "JWKS_URI": "http://localhost:3002/.well-known/jwks.json",
    "JWT_ISSUER": "http://localhost:3002",
    "JWT_AUDIENCE": "https://api.automabase.com",
    "TENANT_ID_CLAIM": "tenant_id"
  },
  "AutomataTrackerFunction": {
    "JWKS_URI": "http://localhost:3002/.well-known/jwks.json",
    "JWT_ISSUER": "http://localhost:3002",
    "JWT_AUDIENCE": "https://api.automabase.com",
    "TENANT_ID_CLAIM": "tenant_id"
  }
}
```

### 生产环境配置

生产环境应该：

1. 使用环境变量或 Secrets Manager 存储配置
2. 每个租户使用独立的 JWKS URI（通过租户配置表动态获取）
3. 使用 HTTPS 的 JWKS endpoint
4. 配置适当的缓存时间（默认 10 分钟）

## 常见问题

### Q: 如何支持多个租户？

A: 当前实现使用统一的 JWKS URI（适合所有租户共享同一个认证服务的场景）。如果需要支持每个租户独立的认证服务，需要：

1. 创建 `TenantConfigTable` 存储每个租户的 `jwksUri` 和 `issuer`
2. 修改 JWT 验证逻辑，先解析 `tenant_id`，再查询对应的配置
3. 实现租户注册 API

### Q: Token 过期后如何处理？

A: Token 过期会返回 `401 Unauthorized`。客户端需要：

1. 检测到 401 错误
2. 重新从租户认证服务获取新 token
3. 重试请求

### Q: 如何撤销 token？

A: JWT 是无状态的，无法直接撤销。如果需要撤销功能，可以：

1. 使用短期 token（如 15 分钟）
2. 维护 token 黑名单（需要额外的存储和查询）
3. 使用租户的认证服务提供的撤销机制

### Q: 本地测试时 JWKS 服务器无法访问？

A: 确保：

1. JWKS 服务器正在运行（`bun run test:jwks:server`）
2. 端口 3002 未被占用
3. `env.json` 中的 `JWKS_URI` 指向正确的地址
4. Lambda 容器可以访问 `localhost:3002`（可能需要使用 `host.docker.internal:3002`）

### Q: 如何测试不同租户？

A: 生成不同租户的 token（使用 ULID 作为 tenantId）：

```bash
# 租户 1 (ULID: 01ARZ3NDEKTSV4RRFFQ69G5FAV)
bun run test:jwt:token user1 01ARZ3NDEKTSV4RRFFQ69G5FAV http://localhost:3002 https://api.automabase.com

# 租户 2 (ULID: 01ARZ3NDEKTSV4RRFFQ69G5FAW)
bun run test:jwt:token user2 01ARZ3NDEKTSV4RRFFQ69G5FAW http://localhost:3002 https://api.automabase.com
```

### Q: 生产环境如何配置？

A: 生产环境配置步骤：

1. 租户注册时提供真实的 JWKS URI 和 Issuer
2. 配置环境变量指向租户的认证服务
3. 确保 JWKS endpoint 支持 HTTPS
4. 配置适当的缓存时间
5. 监控认证失败率

## 安全最佳实践

1. **使用 HTTPS**: 生产环境必须使用 HTTPS 的 JWKS endpoint
2. **密钥轮换**: 定期轮换 RSA 密钥对，更新 JWKS
3. **短期 Token**: 使用较短的过期时间（如 1 小时）
4. **Audience 验证**: 严格验证 `aud` claim，防止 token 被用于其他服务
5. **Issuer 验证**: 严格验证 `iss` claim，确保 token 来自正确的租户
6. **权限最小化**: 只授予必要的权限
7. **监控和告警**: 监控认证失败、token 过期等情况

## 相关资源

- [JWT 规范 (RFC 7519)](https://tools.ietf.org/html/rfc7519)
- [JWKS 规范 (RFC 7517)](https://tools.ietf.org/html/rfc7517)
- [JOSE 库文档](https://github.com/panva/jose)
- [Auth0 JWT 文档](https://auth0.com/docs/secure/tokens/json-web-tokens)
