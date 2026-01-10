# Automabase

**状态机即服务 (Automata-as-a-Service)** - 开源的有限状态机托管平台

## 概述

Automabase 是一个基于 **App Platform** 架构的状态机托管平台，核心理念是：

> **"代码归开发者，数据归用户"**

- **开发者** 发布 App，定义 Blueprint（状态机模板）
- **用户** 基于 Blueprint 创建 Automata 实例
- Automata 实例及其数据归属于创建它的用户，而非 App 开发者

### 主要功能

- 🔐 **统一 OAuth 认证** - 通过 AWS Cognito 集成 Google/GitHub 登录
- 🤖 **有限状态机托管** - 使用 JSONata 定义状态转换逻辑
- 📝 **完整事件审计** - 每次状态变更都记录为不可变的 Event
- 🚀 **实时状态订阅** - WebSocket 实时推送状态变更（即将支持）
- 📦 **App 发布机制** - 开发者可以发布 Blueprint 供其他用户使用

## 架构

```
Account (账户)
├── Automata (AppRegistry Blueprint) ← App 注册信息
│     └── Event (App 信息修改历史)
│
└── Automata (用户的 Blueprint) ← 状态机实例
      └── Event (状态转换历史)
```

### 核心概念

| 概念 | 说明 |
|------|------|
| **Account** | 账户，平台统一认证的用户身份，拥有 Ed25519 公钥用于签名 |
| **App** | 应用，由开发者发布，实际上是一个使用 AppRegistry Blueprint 的 Automata |
| **Blueprint** | 状态机模板，包含状态 Schema、事件 Schema、转换逻辑（隐式实体，自动去重存储） |
| **Automata** | 状态机实例，归属于创建它的 Account |
| **Event** | 触发状态转换的事件，不可变记录 |

---

## 快速开始

### 前置要求

- [Bun](https://bun.sh/) 1.0+
- [AWS CLI](https://aws.amazon.com/cli/) 已配置凭证
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 1. 克隆并安装依赖

```bash
git clone https://github.com/xxx/automabase.git
cd automabase
bun install
```

### 2. 本地开发环境

```bash
# 复制环境变量模板
cp env.json.example env.json

# 启动 DynamoDB Local（需要 Docker）
docker run -d -p 8000:8000 --name dynamodb-local amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb

# 创建本地数据库表
bun run setup:db

# 构建并启动本地 API
bun run sam:local
```

### 3. 运行测试

```bash
# 运行 E2E 测试（需要先启动 sam:local）
bun run test:e2e:local

# 运行单元测试
bun run test
```

---

## API 使用指南

### 认证

所有 API 请求需要携带 JWT Token（通过 AWS Cognito 获取）：

```http
Authorization: Bearer {jwt-token}
```

在本地开发模式 (`LOCAL_DEV_MODE=true`)，可以跳过 JWT 验证。

### Account API

#### 获取当前账户

```http
GET /v1/accounts/me
Authorization: Bearer {token}
```

#### 创建账户

```http
POST /v1/accounts
Authorization: Bearer {token}
Content-Type: application/json

{
  "publicKey": "base64url-encoded-ed25519-public-key"
}
```

### Automata API

#### 创建 Automata

```http
POST /v1/accounts/{accountId}/automatas
Authorization: Bearer {token}
Content-Type: application/json

{
  "blueprint": {
    "appId": "SYSTEM",
    "name": "AppRegistry",
    "stateSchema": { ... },
    "eventSchemas": { ... },
    "initialState": { ... },
    "transition": "..."
  }
}
```

#### 列出 Automatas

```http
GET /v1/accounts/{accountId}/automatas?limit=100&cursor={cursor}
Authorization: Bearer {token}
```

#### 获取 Automata 详情

```http
GET /v1/accounts/{accountId}/automatas/{automataId}
Authorization: Bearer {token}
```

#### 获取 Automata 状态

```http
GET /v1/accounts/{accountId}/automatas/{automataId}/state
Authorization: Bearer {token}
```

### Event API

#### 发送 Event

```http
POST /v1/accounts/{accountId}/automatas/{automataId}/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "SET_INFO",
  "eventData": {
    "name": "My App",
    "description": "A description"
  }
}
```

**响应**:

```json
{
  "eventId": "event:01AN4Z07BY79KA1307SR9X4MV3:000001",
  "baseVersion": "000001",
  "newVersion": "000002",
  "newState": {
    "name": "My App",
    "description": "A description",
    "status": "draft"
  },
  "timestamp": "2026-01-10T10:00:00Z"
}
```

#### 查询 Events

```http
GET /v1/accounts/{accountId}/automatas/{automataId}/events?direction=forward&limit=100
Authorization: Bearer {token}
```

---

## Blueprint 定义

Blueprint 是状态机的模板，定义了状态结构、事件类型和转换逻辑。

### Blueprint 结构

```typescript
interface BlueprintContent {
  // 归属
  appId: string;                        // App 的 automataId，或 "SYSTEM"
  name: string;                         // Blueprint 名称
  
  // 元信息
  description?: string;                 // 描述
  
  // 核心状态机定义
  stateSchema: JSONSchema;              // 状态的 JSON Schema
  eventSchemas: Record<string, JSONSchema>;  // 事件类型 -> JSON Schema
  initialState: unknown;                // 初始状态
  transition: string;                   // JSONata 转换表达式
}
```

### 示例：计数器 Blueprint

```json
{
  "appId": "SYSTEM",
  "name": "Counter",
  "description": "A simple counter state machine",
  
  "stateSchema": {
    "type": "object",
    "properties": {
      "count": { "type": "number" }
    },
    "required": ["count"]
  },
  
  "eventSchemas": {
    "INCREMENT": {
      "type": "object",
      "properties": {
        "amount": { "type": "number", "default": 1 }
      }
    },
    "DECREMENT": {
      "type": "object",
      "properties": {
        "amount": { "type": "number", "default": 1 }
      }
    },
    "RESET": {
      "type": "object"
    }
  },
  
  "initialState": {
    "count": 0
  },
  
  "transition": "$event.type = 'INCREMENT' ? $merge([$state, { \"count\": $state.count + ($event.data.amount ? $event.data.amount : 1) }]) : $event.type = 'DECREMENT' ? $merge([$state, { \"count\": $state.count - ($event.data.amount ? $event.data.amount : 1) }]) : $event.type = 'RESET' ? { \"count\": 0 } : $state"
}
```

---

## JSONata 转换表达式

Automabase 使用 [JSONata](https://jsonata.org/) 作为状态转换引擎。

### 变量绑定

在转换表达式中，以下变量会自动绑定：

| 变量 | 类型 | 说明 |
|------|------|------|
| `$state` | object | 当前状态 |
| `$event.type` | string | 事件类型 |
| `$event.data` | object | 事件数据 |

### 常用模式

#### 1. 条件分支

```jsonata
$event.type = 'INCREMENT' ? (增加逻辑) :
$event.type = 'DECREMENT' ? (减少逻辑) :
$state
```

#### 2. 合并状态 (`$merge`)

`$merge` 是 JSONata 的内置函数，用于合并多个对象：

```jsonata
$merge([$state, { "name": "New Name" }])
```

等价于 JavaScript 的：

```javascript
{ ...state, name: "New Name" }
```

#### 3. 部分更新

只更新 `$event.data` 中提供的字段，保留其他字段：

```jsonata
$merge([$state, $event.data])
```

#### 4. 条件更新

```jsonata
$event.type = 'SET_STATUS' ? 
  $merge([$state, { "status": $event.data.status }]) :
$state
```

### 内置 Blueprint 示例：AppRegistry

```jsonata
$event.type = 'SET_INFO' ? $merge([$state, $event.data]) :
$event.type = 'PUBLISH' ? $merge([$state, { "status": "published" }]) :
$event.type = 'UNPUBLISH' ? $merge([$state, { "status": "draft" }]) :
$event.type = 'ARCHIVE' ? $merge([$state, { "status": "archived" }]) :
$state
```

### 高级用法

#### 数组操作

```jsonata
$event.type = 'ADD_ITEM' ? 
  $merge([$state, { "items": $append($state.items, $event.data.item) }]) :
$event.type = 'REMOVE_ITEM' ? 
  $merge([$state, { "items": $filter($state.items, function($v) { $v.id != $event.data.itemId }) }]) :
$state
```

#### 计算字段

```jsonata
$event.type = 'UPDATE_TOTAL' ?
  (
    $items := $state.items;
    $total := $sum($items.price);
    $merge([$state, { "total": $total }])
  ) :
$state
```

---

## 项目结构

```
automabase/
├── functions/              # Lambda 函数
│   ├── automata-api/       # Automata/Event/Account API
│   └── automata-ws/        # WebSocket API（即将支持）
├── packages/               # 共享包
│   ├── automata-auth/      # JWT 认证
│   ├── automata-core/      # 核心类型、数据库、状态转换引擎
│   ├── automata-client/    # 客户端 SDK
│   └── automata-server/    # 服务端工具
├── e2e/                    # E2E 测试
├── docs/                   # 文档
│   ├── BUSINESS_MODEL_SPEC_v3.md  # 业务模型规范 v3
│   └── JWT_AUTH.md         # JWT 认证文档
├── scripts/                # 构建脚本
├── template.yaml           # SAM 模板
└── merged-template.yaml    # 合并后的 SAM 模板（生成）
```

---

## 常用命令

```bash
# 安装依赖
bun install

# 运行测试
bun run test                 # 单元测试
bun run test:e2e:local       # E2E 测试（本地）

# 构建
bun run build                # 构建所有包
bun run build:functions      # 仅构建 Lambda 函数

# 本地开发
bun run setup:db             # 创建本地 DynamoDB 表
bun run sam:local            # 启动本地 API

# 部署
bun run sam:deploy           # 部署到 AWS
bun run sam:deploy:guided    # 首次部署（引导模式）

# 代码质量
bun run lint                 # 代码检查
bun run lint:fix             # 自动修复
bun run typecheck            # 类型检查

# 工具
bun run keygen               # 生成 Ed25519 密钥对
```

---

## 技术栈

- **运行时**: Bun（本地开发）+ Node.js 24.x（Lambda）
- **语言**: TypeScript 5.3+
- **包管理**: Bun workspaces + Turborepo
- **构建**: esbuild
- **测试**: Vitest
- **代码检查**: Biome
- **部署**: AWS SAM CLI
- **数据库**: DynamoDB (Single Table Design)
- **认证**: AWS Cognito + JWT
- **状态转换**: JSONata

---

## 文档

- [业务模型规范 v3](./docs/BUSINESS_MODEL_SPEC_v3.md) - 完整的业务实体、权限模型、API 规范
- [JWT 认证文档](./docs/JWT_AUTH.md) - JWT 认证、请求签名、本地测试指南

---

## 许可证

MIT License
