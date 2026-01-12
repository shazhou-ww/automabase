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

**一键启动所有服务（推荐）：**

```bash
# 复制环境变量模板
cp env.json.example env.json

# 一键启动 DynamoDB + SAM + Gateway
bun run dev
```

这会自动启动：

- DynamoDB Local (Docker, port 8000)
- SAM Lambda Service (port 3002)
- Dev Gateway (port 3001)

**或者分别启动：**

```bash
# 启动 DynamoDB Local（Docker）
docker compose up dynamodb-local

# 创建本地数据库表
bun run setup:db

# 启动 SAM Lambda 服务（另一个终端）
bun run sam:local

# 启动 Dev Gateway（另一个终端）
bun run dev:gateway:remote
```

### 2.1 WebSocket 本地调试

Dev Gateway 同时模拟 HTTP API 和 WebSocket API，支持 Management API：

- 文档：[docs/WS_LOCAL_DEBUG.md](docs/WS_LOCAL_DEBUG.md)
- WebSocket 端点：`ws://localhost:3000`

### 3. 运行测试

```bash
# 运行 E2E 测试（需要先启动 dev 环境）
bun run test:e2e

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

#### 本地开发模式

本地开发使用 Ed25519 密钥对进行真正的 JWT 验证，行为与线上环境一致：

- 如果配置了 `LOCAL_JWT_PUBLIC_KEY`，则使用本地 JWT 验证（bypass Cognito）
- 如果没有配置，则使用正常的 Cognito 验证

**配置步骤：**

```bash
# 1. 生成密钥对并更新 env.json（SAM Local 和 E2E 测试都会从这里读取）
bun run keygen

# 2. 重启 SAM Local
bun run sam:local
```

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
    "name": "MyApp",
    "state": {
      "schema": { "type": "object", "properties": { "count": { "type": "number" } } },
      "initial": { "count": 0 }
    },
    "events": {
      "INCREMENT": {
        "schema": { "type": "object" },
        "transition": "$merge([$.state, { \"count\": $.state.count + 1 }])"
      }
    }
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

### 数学对应

Blueprint 结构对应有限状态机的数学定义 $M = (S, \Sigma, \delta, s_0)$：

| 数学符号 | Blueprint 字段 | 说明 |
|----------|----------------|------|
| $S$ | `state.schema` | 状态集合（JSON Schema 定义） |
| $s_0$ | `state.initial` | 初始状态 |
| $\Sigma$ | `Object.keys(events)` | 事件字母表 |
| $\delta$ | `events[type].transition` | 转换函数 |

### Blueprint 结构

```typescript
interface BlueprintContent {
  // 归属
  appId: string;           // App 的 automataId，或 "SYSTEM"
  name: string;            // Blueprint 名称
  description?: string;    // 描述（可选）

  // 状态定义
  state: {
    schema: JSONSchema;    // 状态的 JSON Schema
    initial: unknown;      // 初始状态
  };

  // 事件定义：每个事件包含 schema 和对应的 transition
  events: Record<string, {
    schema: JSONSchema;    // 事件数据的 JSON Schema
    transition: string;    // JSONata 转换表达式
  }>;
}
```

### 示例：计数器 Blueprint

```json
{
  "appId": "SYSTEM",
  "name": "Counter",
  "description": "A simple counter state machine",

  "state": {
    "schema": {
      "type": "object",
      "properties": {
        "count": { "type": "number" }
      },
      "required": ["count"]
    },
    "initial": { "count": 0 }
  },

  "events": {
    "INCREMENT": {
      "schema": {
        "type": "object",
        "properties": {
          "amount": { "type": "number", "default": 1 }
        }
      },
      "transition": "$merge([$.state, { \"count\": $.state.count + ($.event.amount ? $.event.amount : 1) }])"
    },
    "DECREMENT": {
      "schema": {
        "type": "object",
        "properties": {
          "amount": { "type": "number", "default": 1 }
        }
      },
      "transition": "$merge([$.state, { \"count\": $.state.count - ($.event.amount ? $.event.amount : 1) }])"
    },
    "RESET": {
      "schema": { "type": "object" },
      "transition": "{ \"count\": 0 }"
    }
  }
}
```

---

## JSONata 转换表达式

Automabase 使用 [JSONata](https://jsonata.org/) 作为状态转换引擎。

### 输入数据结构

每个事件的 `transition` 表达式接收以下输入：

| 路径 | 类型 | 说明 |
|------|------|------|
| `$.state` | object | 当前状态 |
| `$.event` | object | 事件数据（即 API 传入的 `eventData`） |

> **设计说明**：使用 `$.state` 和 `$.event` 作为输入数据路径，保留 `$xxx` 命名空间给未来的扩展函数。

### 常用模式

#### 1. 合并状态 (`$merge`)

`$merge` 是 JSONata 的内置函数，用于合并多个对象：

```jsonata
$merge([$.state, { "name": "New Name" }])
```

等价于 JavaScript 的：

```javascript
{ ...state, name: "New Name" }
```

#### 2. 使用事件数据更新状态

将 `$.event` 中的字段合并到状态：

```jsonata
$merge([$.state, $.event])
```

#### 3. 条件更新

```jsonata
$.event.status ? $merge([$.state, { "status": $.event.status }]) : $.state
```

#### 4. 固定状态变更

不需要事件数据，直接设置状态：

```jsonata
$merge([$.state, { "status": "published" }])
```

### 内置 Blueprint 示例：AppRegistry

```json
{
  "events": {
    "SET_INFO": {
      "schema": { "type": "object", "properties": { "name": {}, "description": {} } },
      "transition": "$merge([$.state, $.event])"
    },
    "PUBLISH": {
      "schema": { "type": "object" },
      "transition": "$merge([$.state, { \"status\": \"published\" }])"
    },
    "UNPUBLISH": {
      "schema": { "type": "object" },
      "transition": "$merge([$.state, { \"status\": \"draft\" }])"
    },
    "ARCHIVE": {
      "schema": { "type": "object" },
      "transition": "$merge([$.state, { \"status\": \"archived\" }])"
    }
  }
}
```

### 高级用法

#### 数组操作

```jsonata
// ADD_ITEM: 添加元素
$merge([$.state, { "items": $append($.state.items, $.event.item) }])

// REMOVE_ITEM: 删除元素
$merge([$.state, { "items": $filter($.state.items, function($v) { $v.id != $.event.itemId }) }])
```

#### 计算字段

```jsonata
(
  $items := $.state.items;
  $total := $sum($items.price);
  $merge([$.state, { "total": $total }])
)
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
