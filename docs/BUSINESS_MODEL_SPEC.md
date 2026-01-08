# Automabase 业务模型规范 v2.0

> 本文档定义了 Automabase 平台的业务模型、权限模型、安全机制和 API 规范。
> 基于 2024 年设计评审确定的最终方案。

## 目录

- [一、概述](#一概述)
- [二、业务实体模型](#二业务实体模型)
- [三、权限模型](#三权限模型)
- [四、安全机制](#四安全机制)
- [五、API 规范](#五api-规范)
- [六、DynamoDB 表设计](#六dynamodb-表设计)
- [七、实施路线图](#七实施路线图)

---

## 一、概述

### 1.1 平台定位

Automabase 是一个 **状态机即服务 (Automata-as-a-Service)** 平台，提供：

- 多租户的有限状态机托管
- 事件驱动的状态转换（使用 JSONata 定义转换逻辑）
- 细粒度的权限控制
- 完整的事件审计追踪
- 实时状态订阅（WebSocket）

### 1.2 架构层次

```
Tenant (租户)
  └── Realm (资源域) - 逻辑分组，隐式创建
        └── Automata (自动机)
              └── Event (事件)
```

### 1.3 核心概念

| 概念 | 说明 |
|------|------|
| **Tenant** | 租户，授权主体 (Issuer)，管理密钥和签发 JWT |
| **Realm** | 资源域，Automata 的逻辑分组，作为授权 Scope |
| **Automata** | 有限状态机实例，包含状态、转换逻辑、事件历史 |
| **Event** | 触发状态转换的事件，不可变记录 |
| **Subject** | 访问主体，由公钥 Hash 标识，代表操作发起者 |

---

## 二、业务实体模型

### 2.1 租户实体 (Tenant)

#### 不可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `tenantId` | ULID | 主键，租户唯一标识 |
| `ownerSubjectId` | string | 所有者 Subject ID = SHA256(OwnerPubKey) |
| `jwksUri` | string | JWKS 端点 URL，用于获取公钥验证 JWT 和描述符签名 |
| `createdAt` | ISO8601 | 创建时间 |

#### 可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 租户名称 |
| `contactName` | string? | 联系人姓名 |
| `contactEmail` | string? | 联系人邮箱 |
| `status` | enum | `active` \| `suspended` \| `deleted` |
| `updatedAt` | ISO8601 | 最后更新时间 |

#### JWKS 密钥管理

租户的 JWKS 端点应包含两类密钥，通过 `kid` 区分：

```json
{
  "keys": [
    {
      "kid": "jwt-2024-01",
      "kty": "OKP",
      "crv": "Ed25519",
      "use": "sig",
      "x": "..."
    },
    {
      "kid": "descriptor-v1",
      "kty": "OKP",
      "crv": "Ed25519",
      "use": "sig",
      "x": "..."
    }
  ]
}
```

- **JWT 签名密钥** (`kid: jwt-*`)：用于签发访问 Token，应定期轮换
- **描述符签名密钥** (`kid: descriptor-*`)：用于签名 Automata 描述符，长期稳定

---

### 2.2 自动机实体 (Automata)

#### 不可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `automataId` | ULID | 主键，自动机唯一标识 |
| `tenantId` | ULID | 归属租户 ID |
| `realmId` | ULID | 归属资源域 ID |
| `descriptor` | object | 描述符（见下文） |
| `descriptorSignature` | string | 描述符的 JWT 签名 |
| `descriptorHash` | string | 描述符的 SHA256 Hash |
| `creatorSubjectId` | string | 创建者 Subject ID（审计用途，不参与鉴权） |
| `createdAt` | ISO8601 | 创建时间 |

#### 描述符结构 (Descriptor)

```typescript
interface AutomataDescriptor {
  name: string;                        // 自动机名称
  stateSchema: JSONSchema;             // 状态的 JSON Schema
  eventSchemas: Record<string, JSONSchema>;  // 事件类型 -> JSON Schema
  transition: string;                  // JSONata 转换表达式
  initialState: unknown;               // 初始状态
}
```

#### 可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentState` | unknown | 当前状态 |
| `version` | Base62(6) | 当前版本号，6 位 Base62 编码 |
| `status` | enum | `active` \| `archived` |
| `updatedAt` | ISO8601 | 最后更新时间 |

#### 版本号说明

- 格式：6 位 Base62 字符串（0-9, a-z, A-Z）
- 初始版本：`000000`
- 最大版本：`ZZZZZZ`（约 568 亿）
- 每次事件使版本号 +1

---

### 2.3 事件实体 (Event)

#### 属性（全部不可变）

| 字段 | 类型 | 说明 |
|------|------|------|
| `automataId` | ULID | 归属自动机 ID（联合主键 1） |
| `baseVersion` | Base62(6) | 基准版本号（联合主键 2） |
| `eventType` | string | 事件类型 |
| `eventData` | unknown | 事件负载数据 |
| `senderSubjectId` | string | 发送者 Subject ID |
| `timestamp` | ISO8601 | 事件时间戳 |

#### Event ID

全局唯一标识符格式：`event:{automataId}:{baseVersion}`

示例：`event:01ARZ3NDEKTSV4RRFFQ69G5FAV:00001a`

#### 事件语义

事件表示从 `baseVersion` 到 `baseVersion + 1` 的状态转换。

---

### 2.4 资源域 (Realm)

Realm 是逻辑概念，不作为独立实体存储：

- 创建 Automata 时指定 `realmId`，自动"创建" Realm
- Realm 作为权限控制的 Scope
- 通过 GSI 查询某 Realm 下的所有 Automata

---

## 三、权限模型

### 3.1 双层权限体系

Automabase 采用双层权限体系，将平台管理与租户业务完全分离：

| 层级 | 用途 | 认证方式 | 操作范围 |
|------|------|----------|----------|
| **平台层** | 管理 Tenant 生命周期 | Admin API Key (Secrets Manager) | 创建/暂停/恢复/删除 Tenant |
| **租户层** | 操作业务资源 | Tenant JWT + 请求签名 | Realm/Automata/Event 操作 |

### 3.2 权限字格式（租户层）

```
{resource-type}:{resource-id}:{access-level}
```

| 组成部分 | 说明 | 示例 |
|---------|------|------|
| `resource-type` | 资源类型 | `realm` / `automata` |
| `resource-id` | 资源 ULID 或 `*` (通配符) | `01F8MECHZX3TBDSZ7XRADM79XV` |
| `access-level` | 访问级别 | `read` / `write` / `readwrite` |

> **注意**：`tenant` 权限字已废弃。Tenant 管理通过 Admin API Key 认证的 tenant-admin-api 进行。

### 3.3 访问级别

| 级别 | 说明 |
|------|------|
| `read` | 只读访问 |
| `write` | 只写访问（预留，MVP 阶段不实现） |
| `readwrite` | 读写访问 |

### 3.4 权限示例

```
realm:01F8MECHZX3TBDSZ7XRADM79XV:read
realm:*:readwrite
automata:01AN4Z07BY79KA1307SR9X4MV3:readwrite
```

### 3.5 权限蕴含规则

| 规则 | 说明 |
|------|------|
| Realm → Automata | Realm 权限蕴含该 Realm 下所有 Automata 的对应权限 |
| readwrite → read | `readwrite` 权限蕴含 `read` 权限 |
| 通配符 | `realm:*:read` 表示对所有 Realm 的读权限 |

### 3.6 操作权限映射

| 操作 | 所需权限 |
|------|---------|
| 读取 Tenant 属性 | 任何有效 JWT（公开只读） |
| 管理 Tenant | Admin API Key（通过 tenant-admin-api） |
| 创建 Automata | `realm:{id}:readwrite` |
| 查询 Automata 状态 | `realm:{id}:read` 或 `automata:{id}:read` |
| 发送 Event | `realm:{id}:readwrite` 或 `automata:{id}:readwrite` |
| 查询 Event 历史 | `realm:{id}:read` 或 `automata:{id}:read` |

---

## 四、安全机制

### 4.1 JWT 结构

租户签发的 JWT 包含以下 Claims：

```json
{
  "iss": "01F8MECHZX3TBDSZ7XRADM79XV",
  "sub": "sha256:abc123def456...",
  "aud": "automabase:api:prod",
  "exp": 1735689600,
  "iat": 1735686000,
  "scope": [
    "realm:01F8MECHZX3TBDSZ7XRADM79XV:read",
    "realm:01F8MECHZX3TBDSZ7XRADM79XV:readwrite"
  ],
  "spk": "base64url-encoded-ed25519-public-key"
}
```

| Claim | 说明 |
|-------|------|
| `iss` | 租户 ID (Issuer) |
| `sub` | Subject ID = SHA256(Subject 公钥) |
| `aud` | Audience，可配置（如 `automabase:api:prod`） |
| `exp` | 过期时间 (Unix timestamp) |
| `iat` | 签发时间 (Unix timestamp) |
| `scope` | 权限字数组 |
| `spk` | Session Public Key (Ed25519, 32 字节, Base64URL 编码) |

### 4.2 请求签名机制

所有请求需要：
1. **JWT Token**：在 `Authorization: Bearer {token}` header 中
2. **Request ID**：在 `X-Request-Id` header 中，ULID 格式
3. **Timestamp**：在 `X-Request-Timestamp` header 中，ISO8601 格式
4. **Signature**：在 `X-Request-Signature` header 中，Ed25519 签名

#### Canonical Request 结构

```
{HTTP-Method}\n
{Path}\n
{Query-String-Sorted}\n
{Canonical-Headers}\n
{Signed-Headers}\n
{Body-SHA256}
```

#### 必须签名的 Headers

- `host`
- `x-request-id`
- `x-request-timestamp`
- `content-type`（如有 Body）

#### 签名算法

- **算法**：Ed25519
- **密钥**：JWT 中 `spk` 对应的私钥（客户端持有）
- **签名格式**：Base64URL 编码

### 4.3 重放攻击防护

| 机制 | 说明 |
|------|------|
| Request ID 去重 | 缓存 5 分钟内的 Request ID，拒绝重复 |
| Timestamp 验证 | 请求时间戳与服务器时间差不超过 5 分钟 |
| JWT 过期检查 | 验证 `exp` claim |

---

## 五、API 规范

### 5.1 通用规范

- **Base URL**: `https://api.automabase.com/v1`
- **认证**: 所有请求需要 JWT + 请求签名
- **Tenant ID**: 从 JWT `iss` claim 提取，无需在请求中传递
- **Subject ID**: 从 JWT `sub` claim 提取

### 5.2 Tenant API（租户层 - 只读）

任何持有有效 Tenant JWT 的用户都可以读取自己 Tenant 的公开信息。

#### 读取 Tenant

```http
GET /tenant
Authorization: Bearer {token}
X-Request-Id: {ulid}
X-Request-Timestamp: {iso8601}
X-Request-Signature: {signature}
```

**权限**: 任何有效 JWT（公开只读）

**响应**:

```json
{
  "tenantId": "01F8MECHZX3TBDSZ7XRADM79XV",
  "name": "My Company",
  "contactName": "John Doe",
  "contactEmail": "john@example.com",
  "status": "active",
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

> **注意**：Tenant 的更新、暂停、删除等管理操作通过 Tenant Admin API 进行。

---

### 5.2.1 Tenant Admin API（平台层）

Tenant 生命周期管理 API，需要 Admin API Key 认证。

#### 认证方式

```http
X-Admin-Key: {keyId}:{secret}
```

或

```http
Authorization: AdminKey {keyId}:{secret}
```

Admin API Key 存储在 AWS Secrets Manager 中，secret 名称为 `automabase/admin-api-key`。

#### 创建 Tenant

```http
POST /admin/tenants
X-Admin-Key: {keyId}:{secret}
Content-Type: application/json

{
  "name": "My Company",
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "ownerSubjectId": "sha256:abc123..."
}
```

**响应** (201 Created):

```json
{
  "tenantId": "01F8MECHZX3TBDSZ7XRADM79XV",
  "name": "My Company",
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "ownerSubjectId": "sha256:abc123...",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### 列出 Tenants

```http
GET /admin/tenants?limit={n}&cursor={cursor}
X-Admin-Key: {keyId}:{secret}
```

#### 获取 Tenant 详情

```http
GET /admin/tenants/{tenantId}
X-Admin-Key: {keyId}:{secret}
```

#### 更新 Tenant

```http
PATCH /admin/tenants/{tenantId}
X-Admin-Key: {keyId}:{secret}
Content-Type: application/json

{
  "name": "New Company Name",
  "contactEmail": "new@example.com",
  "jwksUri": "https://new-auth.example.com/.well-known/jwks.json"
}
```

**响应**:

```json
{
  "tenantId": "01F8MECHZX3TBDSZ7XRADM79XV",
  "updatedFields": ["name", "contactEmail", "jwksUri"],
  "updatedAt": "2024-01-20T10:00:00Z"
}
```

#### 暂停 Tenant

```http
POST /admin/tenants/{tenantId}/suspend
X-Admin-Key: {keyId}:{secret}
```

**响应**:

```json
{
  "tenantId": "01F8MECHZX3TBDSZ7XRADM79XV",
  "status": "suspended",
  "updatedAt": "2024-01-20T10:00:00Z"
}
```

#### 恢复 Tenant

```http
POST /admin/tenants/{tenantId}/resume
X-Admin-Key: {keyId}:{secret}
```

#### 删除 Tenant

```http
DELETE /admin/tenants/{tenantId}
X-Admin-Key: {keyId}:{secret}
```

**响应**:

```json
{
  "tenantId": "01F8MECHZX3TBDSZ7XRADM79XV",
  "status": "deleted",
  "deletedAt": "2024-01-20T10:00:00Z"
}
```

---

### 5.3 Realm API

#### 列出 Realms

```http
GET /realms?limit={n}&cursor={cursor}
```

**权限**: 至少拥有一个 `realm:*:read` 权限

**响应**:
```json
{
  "realms": [
    {
      "realmId": "01F8MECHZX3TBDSZ7XRADM79XV",
      "automataCount": 42,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "nextCursor": "..."
}
```

---

### 5.4 Automata API

#### 创建 Automata

```http
POST /realms/{realmId}/automatas
Content-Type: application/json

{
  "descriptor": {
    "name": "Counter",
    "stateSchema": { "type": "object", "properties": { "count": { "type": "number" } } },
    "eventSchemas": {
      "INCREMENT": { "type": "object" },
      "DECREMENT": { "type": "object" }
    },
    "initialState": { "count": 0 },
    "transition": "$merge([$$, { count: $$.count + ($event.type = 'INCREMENT' ? 1 : -1) }])"
  },
  "descriptorSignature": "eyJhbGciOiJFZERTQSIsImtpZCI6ImRlc2NyaXB0b3ItdjEifQ..."
}
```

**权限**: `realm:{realmId}:readwrite`

**响应**:
```json
{
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "createdAt": "2024-01-20T10:00:00Z"
}
```

#### 列出 Realm 下的 Automatas

```http
GET /realms/{realmId}/automatas?limit={n}&cursor={cursor}
```

**权限**: `realm:{realmId}:read`

**响应**:
```json
{
  "automatas": [
    {
      "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
      "name": "Counter",
      "version": "00001a",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-20T10:00:00Z"
    }
  ],
  "nextCursor": "..."
}
```

#### 查询 Automata 状态

```http
GET /automatas/{automataId}/state
```

**权限**: `realm:{realmId}:read` 或 `automata:{automataId}:read`

**响应**:
```json
{
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "currentState": { "count": 42 },
  "version": "00001a",
  "status": "active",
  "updatedAt": "2024-01-20T10:00:00Z"
}
```

#### 查询 Automata 创建信息

```http
GET /automatas/{automataId}/descriptor
```

**权限**: `realm:{realmId}:read` 或 `automata:{automataId}:read`

**响应**:
```json
{
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "tenantId": "01F8MECHZX3TBDSZ7XRADM79XV",
  "realmId": "01F8MECHZX3TBDSZ7XRADM79XV",
  "descriptor": { ... },
  "descriptorHash": "sha256:...",
  "creatorSubjectId": "sha256:...",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### 归档 Automata

```http
PATCH /automatas/{automataId}
Content-Type: application/json

{
  "status": "archived"
}
```

**权限**: `realm:{realmId}:readwrite` 或 `automata:{automataId}:readwrite`

**响应**:
```json
{
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "status": "archived",
  "updatedAt": "2024-01-20T10:00:00Z"
}
```

---

### 5.5 Event API

#### 发送 Event

```http
POST /automatas/{automataId}/events
Content-Type: application/json

{
  "eventType": "INCREMENT",
  "eventData": { "amount": 1 }
}
```

**权限**: `realm:{realmId}:readwrite` 或 `automata:{automataId}:readwrite`

**响应**:
```json
{
  "eventId": "event:01AN4Z07BY79KA1307SR9X4MV3:00001b",
  "baseVersion": "00001a",
  "newVersion": "00001b",
  "newState": { "count": 43 },
  "timestamp": "2024-01-20T10:00:00Z"
}
```

**可选参数**: `?include=oldState` 返回旧状态

#### 查询 Events

```http
GET /automatas/{automataId}/events?direction={forward|backward}&anchor={version}&limit={n}
```

**参数**:
| 参数 | 说明 |
|------|------|
| `direction` | `forward`（从旧到新）或 `backward`（从新到旧） |
| `anchor` | 起始版本号（可选，默认从头/尾开始） |
| `limit` | 返回数量限制（默认 100，最大 1000） |

**权限**: `realm:{realmId}:read` 或 `automata:{automataId}:read`

**响应**:
```json
{
  "events": [
    {
      "eventId": "event:01AN4Z07BY79KA1307SR9X4MV3:000001",
      "baseVersion": "000000",
      "eventType": "INCREMENT",
      "eventData": { "amount": 1 },
      "senderSubjectId": "sha256:...",
      "timestamp": "2024-01-01T00:00:00Z"
    }
  ],
  "nextAnchor": "000010"
}
```

#### 查询单个 Event

```http
GET /automatas/{automataId}/events/{baseVersion}
```

**权限**: `realm:{realmId}:read` 或 `automata:{automataId}:read`

**响应**:
```json
{
  "eventId": "event:01AN4Z07BY79KA1307SR9X4MV3:00001a",
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "baseVersion": "00001a",
  "eventType": "INCREMENT",
  "eventData": { "amount": 1 },
  "senderSubjectId": "sha256:...",
  "timestamp": "2024-01-20T10:00:00Z"
}
```

---

### 5.6 WebSocket API (Phase 1: 只读)

#### 连接

```
wss://api.automabase.com/v1/ws?token={jwt}
```

#### 订阅 Automata

```json
{
  "action": "subscribe",
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "token": "{jwt}"
}
```

**权限**: `realm:{realmId}:read` 或 `automata:{automataId}:read`

#### 下行消息: 订阅成功

```json
{
  "type": "subscribed",
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "state": { "count": 42 },
  "version": "00001a",
  "timestamp": "2024-01-20T10:00:00Z"
}
```

#### 下行消息: 状态更新

```json
{
  "type": "state",
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "eventId": "event:01AN4Z07BY79KA1307SR9X4MV3:00001b",
  "event": {
    "type": "INCREMENT",
    "data": { "amount": 1 }
  },
  "state": { "count": 43 },
  "version": "00001b",
  "timestamp": "2024-01-20T10:01:00Z"
}
```

#### 取消订阅

```json
{
  "action": "unsubscribe",
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3"
}
```

---

## 六、DynamoDB 表设计

### 6.1 主表 (AutomabaseTable)

**单表设计 (Single Table Design)**

| Entity | PK | SK | lsi1sk |
|--------|----|----|--------|
| Tenant | `TENANT#{tenantId}` | `#META` | - |
| Automata | `AUTOMATA#{automataId}` | `#META` | - |
| Event | `AUTOMATA#{automataId}` | `EVT#{version}` | `EVTYPE#{eventType}#{version}` |
| Snapshot | `AUTOMATA#{automataId}` | `SNAP#{version}` | - |

### 6.2 LSI 设计

#### LSI1: 按事件类型查询 Events

| PK | SK (LSI1) |
|----|-----------|
| `AUTOMATA#{automataId}` | `EVTYPE#{eventType}#{version}` |

**用途**：按 eventType 过滤查询某 Automata 的事件

**查询示例**：
- 按类型查询：`begins_with(lsi1sk, 'EVTYPE#INCREMENT#')`
- 按类型 + 版本范围：`lsi1sk BETWEEN 'EVTYPE#INCREMENT#000010' AND 'EVTYPE#INCREMENT#000020'`

### 6.3 GSI 设计

#### GSI1: 按 Tenant/Realm 查询 Automata

| PK | SK |
|----|-----|
| `TENANT#{tenantId}#REALM#{realmId}` | `{createdAt}#{automataId}` |

#### GSI2: 按 Subject 查询 (审计)

| PK | SK |
|----|-----|
| `SUBJECT#{subjectId}` | `{createdAt}#{automataId}` |

### 6.4 Request ID 去重表 (RequestIdTable)

| PK | TTL |
|----|-----|
| `{requestId}` | `{currentTime + 5min}` |

使用 DynamoDB TTL 自动清理过期记录。

---

## 七、实施路线图

### Phase 0: 准备工作

- [x] 完成业务模型设计评审
- [x] 将现有 functions 改名为 `-exp` 后缀
- [x] 移除 `-exp` 后缀的实验性函数包
- [x] 创建新的 functions 骨架
  - [x] `automata-api`
  - [x] `automata-ws`
  - [x] `tenant-api`
  - [x] `tenant-admin-api`

### Phase 1: 核心功能 (MVP)

- [x] **数据模型**
  - [x] 定义 TypeScript 类型（基于本规范）
  - [x] 实现 DynamoDB 表操作工具
  - [x] 实现 Base62 版本号工具

- [x] **认证授权**
  - [x] 实现 JWT 验证（支持动态 JWKS）
  - [x] 实现权限字解析和验证（移除 tenant 权限字）
  - [x] 实现 Tenant 配置管理

- [x] **平台认证** (`@automabase/platform-auth`)
  - [x] 实现 Admin API Key 认证
  - [x] 集成 AWS Secrets Manager
  - [x] 实现认证中间件

- [x] **Tenant Admin API** (`tenant-admin-api`)
  - [x] POST /admin/tenants (创建)
  - [x] GET /admin/tenants (列表)
  - [x] GET /admin/tenants/{id} (详情)
  - [x] PATCH /admin/tenants/{id} (更新)
  - [x] POST /admin/tenants/{id}/suspend (暂停)
  - [x] POST /admin/tenants/{id}/resume (恢复)
  - [x] DELETE /admin/tenants/{id} (删除)

- [x] **Tenant API** (`tenant-api`)
  - [x] GET /tenant (只读公开)

- [x] **Automata API** (`automata-api`)
  - [x] POST /realms/{realmId}/automatas
  - [x] GET /realms
  - [x] GET /realms/{realmId}/automatas
  - [x] GET /automatas/{automataId}/state
  - [x] GET /automatas/{automataId}/descriptor
  - [x] PATCH /automatas/{automataId}
  - [x] POST /automatas/{automataId}/events
  - [x] GET /automatas/{automataId}/events
  - [x] GET /automatas/{automataId}/events/{version}

- [x] **WebSocket** (`automata-ws`)
  - [x] 连接管理
  - [x] 订阅/取消订阅
  - [x] 状态推送（只读）

### Phase 2: 增强安全

- [x] **请求签名**
  - [x] 实现 Canonical Request 构造
  - [x] 实现 Ed25519 签名验证
  - [x] 实现签名中间件

- [x] **防重放**
  - [x] 创建 Request ID 去重表
  - [x] 实现 Request ID 验证
  - [x] 实现 Timestamp 验证

### Phase 3: 高级功能

- [x] **WebSocket 读写**
  - [x] 上行发送 Event
  - [x] 双向实时通信

- [x] **历史状态**
  - [x] 实现 Snapshot 存储（每 62 版本）
  - [x] 实现历史状态查询 API

- [x] **通配符权限**
  - [x] 支持 `realm:*:read` 格式

- [x] **批量操作**
  - [x] 批量发送 Events
  - [x] 批量查询状态

---

## 附录

### A. Base62 编码

字符集: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`

6 位 Base62 版本号范围: `000000` ~ `zzzzzz` (约 568 亿)

### B. Subject ID 计算

```typescript
import { createHash } from 'crypto';

function computeSubjectId(publicKey: Uint8Array): string {
  const hash = createHash('sha256').update(publicKey).digest('hex');
  return `sha256:${hash}`;
}
```

### C. Event ID 格式

```
event:{automataId}:{baseVersion}
```

示例: `event:01ARZ3NDEKTSV4RRFFQ69G5FAV:00001a`
