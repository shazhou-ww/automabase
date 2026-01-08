# Automabase

**状态机即服务 (Automata-as-a-Service)** - 开源的多租户有限状态机托管平台

## 概述

Automabase 提供：

- 多租户的有限状态机托管
- 事件驱动的状态转换（使用 JSONata 定义转换逻辑）
- 细粒度的权限控制
- 完整的事件审计追踪
- 实时状态订阅（WebSocket）

## 架构

```
Platform Layer (Admin API Key)
└── tenant-admin-api         # Tenant 生命周期管理

Tenant Layer (Tenant JWT)
├── tenant-api               # Tenant 信息只读查询
├── automata-api             # Automata/Event CRUD
└── automata-ws              # WebSocket 实时订阅
```

## 快速开始

### 前置要求

- [Bun](https://bun.sh/) 1.0+
- [AWS CLI](https://aws.amazon.com/cli/) 已配置凭证
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)（本地开发可选）

### 1. 克隆并安装依赖

```bash
git clone https://github.com/xxx/automabase.git
cd automabase
bun install --no-cache
```

### 2. 配置 Admin API Key

在部署前，先在 AWS Secrets Manager 中创建 Admin API Key：

```bash
aws secretsmanager create-secret \
  --name automabase/admin-api-key \
  --secret-string '{
    "keyId": "admin-001",
    "secret": "your-secure-secret-min-32-characters-here"
  }'
```

> **安全提示**：请使用强密码（至少 32 个字符），并妥善保管。

### 3. 部署到 AWS

```bash
# 构建并部署（首次部署使用 --guided）
bun run sam:deploy:guided
```

部署完成后，会输出 API 端点：

```
Outputs:
  AutomataApiEndpoint: https://xxx.execute-api.region.amazonaws.com/Prod/v1
  TenantAdminApiEndpoint: https://xxx.execute-api.region.amazonaws.com/Prod/admin
```

### 4. 创建第一个 Tenant

使用 Admin API Key 创建 Tenant：

```bash
curl -X POST https://xxx.execute-api.region.amazonaws.com/Prod/admin/tenants \
  -H "X-Admin-Key: admin-001:your-secure-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App",
    "jwksUri": "https://myapp.com/.well-known/jwks.json",
    "ownerSubjectId": "sha256:your-public-key-hash"
  }'
```

响应：

```json
{
  "tenantId": "01JGXXX...",
  "name": "My App",
  "status": "active",
  "createdAt": "2024-01-20T10:00:00Z"
}
```

### 5. 配置 JWKS

在你的服务端托管 JWKS 公钥文件（与 `jwksUri` 对应）：

```json
{
  "keys": [{
    "kid": "jwt-2024-01",
    "kty": "OKP",
    "crv": "Ed25519",
    "use": "sig",
    "x": "base64url-encoded-public-key"
  }]
}
```

### 6. 使用业务 API

签发 Tenant JWT 后，即可使用业务 API：

```bash
# 创建 Automata
curl -X POST https://xxx.execute-api.region.amazonaws.com/Prod/v1/realms/{realmId}/automatas \
  -H "Authorization: Bearer {tenant-jwt}" \
  -H "X-Request-Id: {ulid}" \
  -H "X-Request-Timestamp: {iso8601}" \
  -H "X-Request-Signature: {signature}" \
  -H "Content-Type: application/json" \
  -d '{
    "descriptor": {
      "name": "Counter",
      "stateSchema": { "type": "object", "properties": { "count": { "type": "number" } } },
      "eventSchemas": { "INCREMENT": { "type": "object" } },
      "initialState": { "count": 0 },
      "transition": "$merge([$$, { count: $$.count + 1 }])"
    }
  }'
```

---

## 本地开发

### 环境配置

1. 复制环境变量模板：

```bash
cp env.json.example env.json
```

2. `env.json` 示例配置：

```json
{
  "Parameters": {
    "NODE_ENV": "development"
  },
  "TenantAdminApiFunction": {
    "TABLE_NAME": "automabase-dev",
    "ADMIN_API_KEY_SECRET": "automabase/admin-api-key"
  },
  "TenantApiFunction": {
    "AUTOMABASE_TABLE": "automabase-dev",
    "REQUEST_ID_TABLE": "automabase-request-ids-dev",
    "JWT_AUDIENCE": "automabase:api:dev"
  },
  "AutomataApiFunction": {
    "AUTOMABASE_TABLE": "automabase-dev",
    "REQUEST_ID_TABLE": "automabase-request-ids-dev",
    "JWT_AUDIENCE": "automabase:api:dev"
  }
}
```

注意：本地开发时，`TenantAdminApiFunction` 会从环境变量 `ADMIN_API_KEY_SECRET` 获取密钥名称，但实际验证会调用 AWS Secrets Manager。在本地测试时，可以在代码中临时跳过验证，或使用 AWS CLI 配置的凭证访问真实的 Secrets Manager。

### 启动本地 DynamoDB

```bash
# 使用 Docker 启动 DynamoDB Local
docker run -d -p 8000:8000 --name dynamodb-local amazon/dynamodb-local

# 创建开发用表
aws dynamodb create-table \
  --table-name automabase-dev \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
    AttributeName=gsi1pk,AttributeType=S \
    AttributeName=gsi1sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes \
    '[{"IndexName":"gsi1","KeySchema":[{"AttributeName":"gsi1pk","KeyType":"HASH"},{"AttributeName":"gsi1sk","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url http://localhost:8000
```

### 启动本地 API

```bash
# 构建所有函数
bun run build:functions

# 合并 SAM 模板
bun run sam:merge

# 启动本地 API Gateway
bun run sam:local
```

### 运行测试

```bash
# 运行所有测试
bun run test

# 运行特定包的测试
cd packages/platform-auth && bun run test
```

### 类型检查

```bash
bun run typecheck
```

### 代码检查

```bash
# 检查代码
bun run lint

# 自动修复
bun run lint:fix
```

---

## 项目结构

```
automabase/
├── functions/              # Lambda 函数
│   ├── tenant-admin-api/   # Tenant 管理 API (Admin API Key)
│   ├── tenant-api/         # Tenant 查询 API (Tenant JWT)
│   ├── automata-api/       # Automata 业务 API (Tenant JWT)
│   └── automata-ws/        # WebSocket API (Tenant JWT)
├── packages/               # 共享包
│   ├── platform-auth/      # 平台层认证 (Admin API Key)
│   ├── automata-auth/      # 租户层认证 (Tenant JWT)
│   ├── automata-core/      # 核心类型和数据库操作
│   └── automata-client/    # 客户端 SDK
├── docs/                   # 文档
│   ├── BUSINESS_MODEL_SPEC.md  # 业务模型规范
│   └── JWT_AUTH.md         # JWT 认证文档
└── template.yaml           # SAM 模板
```

---

## API 概览

### 平台层 API (Admin API Key)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /admin/tenants | 创建 Tenant |
| GET | /admin/tenants | 列出 Tenants |
| GET | /admin/tenants/{id} | 获取 Tenant 详情 |
| PATCH | /admin/tenants/{id} | 更新 Tenant |
| POST | /admin/tenants/{id}/suspend | 暂停 Tenant |
| POST | /admin/tenants/{id}/resume | 恢复 Tenant |
| DELETE | /admin/tenants/{id} | 删除 Tenant |

### 租户层 API (Tenant JWT)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /tenant | 获取 Tenant 信息（公开只读） |
| GET | /realms | 列出 Realms |
| POST | /realms/{realmId}/automatas | 创建 Automata |
| GET | /automatas/{id}/state | 获取 Automata 状态 |
| POST | /automatas/{id}/events | 发送 Event |
| GET | /automatas/{id}/events | 查询 Events |

---

## 权限模型

### 双层认证体系

| 层级 | 认证方式 | 用途 |
|------|----------|------|
| 平台层 | Admin API Key (Secrets Manager) | 管理 Tenant 生命周期 |
| 租户层 | Tenant JWT + 请求签名 | 操作 Realm/Automata/Event |

### 权限字格式

```
{resource-type}:{resource-id}:{access-level}
```

示例：

```
realm:01F8MECHZX3TBDSZ7XRADM79XV:readwrite
automata:01AN4Z07BY79KA1307SR9X4MV3:read
realm:*:read  # 通配符
```

---

## 文档

- [业务模型规范](./docs/BUSINESS_MODEL_SPEC.md) - 完整的业务实体、权限模型、API 规范
- [JWT 认证文档](./docs/JWT_AUTH.md) - JWT 认证、请求签名、本地测试指南

---

## 技术栈

- **运行时**: Bun（本地开发）+ Node.js 24.x（Lambda）
- **语言**: TypeScript 5.3+
- **包管理**: Bun workspaces + Turborepo
- **构建**: esbuild (Lambda) / Vite (Apps)
- **测试**: Vitest
- **代码检查**: Biome
- **部署**: AWS SAM CLI
- **数据库**: DynamoDB (Single Table Design)

---

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](./CONTRIBUTING.md)（待创建）了解如何参与。

## 许可证

MIT License
