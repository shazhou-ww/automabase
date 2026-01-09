# Automabase 业务模型规范 v3.0

> 本文档定义了 Automabase 平台的业务模型、安全机制和 API 规范。
> 基于 2026 年 1 月设计评审确定的 App Platform 架构方案。

## 目录

- [一、概述](#一概述)
- [二、业务实体模型](#二业务实体模型)
- [三、Blueprint 规范](#三blueprint-规范)
- [四、安全机制](#四安全机制)
- [五、API 规范](#五api-规范)
- [六、DynamoDB 表设计](#六dynamodb-表设计)
- [七、实施路线图](#七实施路线图)

---

## 一、概述

### 1.1 平台定位

Automabase 是一个 **状态机即服务 (Automata-as-a-Service)** 平台，提供：

- 统一 OAuth 认证的用户体系
- 有限状态机托管（Automata）
- 事件驱动的状态转换（使用 JSONata 定义转换逻辑）
- 完整的事件审计追踪
- 实时状态订阅（WebSocket）
- App 发布与分发机制

### 1.2 核心理念

**"代码归开发者，数据归用户"**

- **开发者** 发布 App，定义 Blueprint（状态机模板）
- **用户** 基于 Blueprint 创建 Automata 实例
- Automata 实例及其数据归属于创建它的用户，而非 App 开发者

### 1.3 架构层次

```
Account (账户)
├── Automata (AppRegistry Blueprint) ← App 注册信息
│     └── Event (App 信息修改历史)
│
└── Automata (用户的 Blueprint) ← 状态机实例
      └── Event (状态转换历史)
```

### 1.4 核心概念

| 概念 | 说明 |
|------|------|
| **Account** | 账户，平台统一认证的用户身份，拥有公钥用于签名 |
| **App** | 应用，由开发者发布，实际上是一个使用 AppRegistry Blueprint 的 Automata |
| **Blueprint** | 状态机模板，包含状态 Schema、事件 Schema、转换逻辑，**隐式实体**（自动去重存储） |
| **Automata** | 状态机实例，归属于创建它的 Account |
| **Event** | 触发状态转换的事件，不可变记录 |

---

## 二、业务实体模型

系统有 **六个实体**：Account、Automata、Event + 三个隐式实体。

- **显式实体**：Account、Automata、Event —— 用户直接创建和操作
- **隐式实体**：
  - **Blueprint** —— 系统自动管理，用于去重存储和共享
  - **Snapshot** —— 系统自动创建，用于快速恢复历史状态
  - **Stats** —— 系统自动维护，用于快速查询统计数据

### 2.1 账户实体 (Account)

Account 是平台的核心实体，代表一个用户身份。

#### 不可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `accountId` | string | 主键，= Base62(MurmurHash128(publicKey)) |
| `publicKey` | string | Ed25519 公钥，Base64URL 编码，32 bytes |
| `oauthSubject` | string | OAuth Provider 的 sub claim |
| `oauthProvider` | string | OAuth Provider 标识（如 `google`, `github`） |
| `createdAt` | ISO8601 | 创建时间 |

#### 可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `displayName` | string | 显示名称 |
| `email` | string? | 邮箱地址 |
| `avatarUrl` | string? | 头像 URL |
| `status` | enum | `active` \| `suspended` \| `deleted` |
| `updatedAt` | ISO8601 | 最后更新时间 |

#### Account ID 生成

```typescript
import { murmurhash128 } from 'murmurhash';
import { base62 } from 'base62';

function generateAccountId(publicKey: Uint8Array): string {
  const hash = murmurhash128(publicKey);
  return base62.encode(hash);  // 约 22 字符
}
```

---

### 2.2 自动机实体 (Automata)

Automata 是状态机实例，同时也用于表示 App（通过 Builtin Blueprint）。

#### 不可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `automataId` | ULID | 主键，自动机唯一标识 |
| `ownerAccountId` | string | 归属的 Account（使用者，非开发者） |
| `blueprintId` | string | Blueprint 标识：`{appId}:{name}:{hash}` 或 `SYSTEM:{name}:{hash}` |
| `createdAt` | ISO8601 | 创建时间 |

> **注意**：Blueprint 内容不再冗余存储在 Automata 中，而是通过 `blueprintId` 引用隐式存储的 Blueprint 实体。

#### 可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentState` | unknown | 当前状态 |
| `version` | Base62(6) | 当前版本号，6 位 Base62 编码 |
| `status` | enum | `active` \| `archived` |
| `updatedAt` | ISO8601 | 最后更新时间 |

#### 版本号说明

- 格式：6 位 Base62 字符串（0-9, A-Z, a-z）
- 初始版本：`000000`
- 最大版本：`zzzzzz`（约 568 亿）
- 每次事件使版本号 +1

#### App 的特殊性

当 `blueprintId` 以 `SYSTEM:AppRegistry:` 开头时，该 Automata 表示一个 App：

- `automataId` 即为 `appId`
- `currentState` 包含 App 的注册信息（名称、描述等）
- `ownerAccountId` 是 App 的开发者

---

### 2.3 事件实体 (Event)

Event 触发 Automata 的状态转换，是不可变的审计记录。

#### 属性（全部不可变）

| 字段 | 类型 | 说明 |
|------|------|------|
| `automataId` | ULID | 归属自动机 ID（联合主键 1） |
| `baseVersion` | Base62(6) | 基准版本号（联合主键 2） |
| `eventType` | string | 事件类型 |
| `eventData` | unknown | 事件负载数据 |
| `senderAccountId` | string | 发送者 Account ID |
| `timestamp` | ISO8601 | 事件时间戳 |

#### Event ID

全局唯一标识符格式：`event:{automataId}:{baseVersion}`

示例：`event:01ARZ3NDEKTSV4RRFFQ69G5FAV:00001a`

#### 事件语义

事件表示从 `baseVersion` 到 `baseVersion + 1` 的状态转换。

---

### 2.5 快照实体 (Snapshot) - 隐式

Snapshot 是状态的定期快照，**隐式实体**，系统自动创建和管理。

#### 用途

- **快速恢复**：查询历史状态时，无需从头重放所有 Event
- **性能优化**：从最近的 Snapshot 开始，只需重放少量 Event

#### 属性（全部不可变）

| 字段 | 类型 | 说明 |
|------|------|------|
| `automataId` | ULID | 归属自动机 ID（联合主键 1） |
| `version` | Base62(6) | 快照版本号（联合主键 2） |
| `state` | unknown | 该版本的完整状态 |
| `createdAt` | ISO8601 | 快照创建时间 |

#### 创建策略

系统每隔固定版本数自动创建 Snapshot：

```typescript
const SNAPSHOT_INTERVAL = 62;  // 每 62 个版本创建一个快照

function shouldCreateSnapshot(version: number): boolean {
  return version % SNAPSHOT_INTERVAL === 0;
}
```

#### 查询历史状态

```typescript
async function getStateAtVersion(automataId: string, targetVersion: string): Promise<unknown> {
  // 1. 找到最近的 Snapshot（<= targetVersion）
  const snapshot = await findNearestSnapshot(automataId, targetVersion);
  
  // 2. 从 Snapshot 开始重放 Event
  let state = snapshot?.state ?? initialState;
  const startVersion = snapshot?.version ?? '000000';
  
  const events = await getEventRange(automataId, startVersion, targetVersion);
  for (const event of events) {
    state = applyTransition(state, event);
  }
  
  return state;
}
```

---

### 2.6 统计实体 (Stats) - 隐式

Stats 是审计统计节点，**隐式实体**，系统自动维护。

#### 用途

- **消费者计费**：统计用户创建的 Automata 和 Event 数量
- **生产者分成**：统计开发者的 Blueprint 被使用量
- **快速查询**：无需扫描即可获取统计数据

#### 双线统计模型

同一个 Account 可以同时是 **消费者** 和 **生产者**：

```
Account (用户 A)
├── 作为消费者：创建了 100 个 Automata，产生 5000 个 Event → 平台向 A 计费
└── 作为生产者：发布的 App 被别人用了 1000 次 → 平台给 A 分成
```

#### 统计层级

**消费者侧（计费）**：

| 层级 | Stats ID 格式 | 统计内容 |
|------|---------------|----------|
| 消费者 | `STATS#CONSUMER#{accountId}` | 用户创建的所有 Automata 和 Event 数 |

**生产者侧（分成）**：

| 层级 | Stats ID 格式 | 统计内容 |
|------|---------------|----------|
| 生产者 | `STATS#PRODUCER#{accountId}` | 开发者的所有 App 被使用量 |
| App | `STATS#APP#{appId}` | 该 App 下所有 Blueprint 的使用量 |
| Blueprint Name | `STATS#APP#{appId}#NAME#{name}` | 该 Blueprint（所有版本）的使用量 |
| Blueprint Version | `STATS#BLUEPRINT#{blueprintId}` | 特定版本的使用量 |

#### 属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `statsId` | string | 主键，格式见上表 |
| `automataCount` | number | Automata 数量 |
| `eventCount` | number | Event 数量 |
| `lastActivityAt` | ISO8601 | 最后活动时间 |
| `updatedAt` | ISO8601 | 统计更新时间 |

#### 时间粒度

统计数据按时间分桶存储，支持多粒度查询：

| 粒度 | Stats ID 格式 | 保留时长 | 用途 |
|------|---------------|----------|------|
| 小时 | `STATS#CONSUMER#{id}#HOUR#2024-01-20T10` | 7 天 | 实时监控 |
| 日 | `STATS#CONSUMER#{id}#DAY#2024-01-20` | 90 天 | 趋势分析 |
| 月 | `STATS#CONSUMER#{id}#MONTH#2024-01` | 永久 | 计费周期 |
| 累计 | `STATS#CONSUMER#{id}` | 永久 | 总量查询 |

**时间戳格式**：

- 小时：`2024-01-20T10`（ISO8601 截断到小时）
- 日：`2024-01-20`
- 月：`2024-01`

**TTL 清理**：

```typescript
// 小时统计：7 天后过期
hourlyStats.ttl = currentTime + 7 * 24 * 60 * 60;

// 日统计：90 天后过期
dailyStats.ttl = currentTime + 90 * 24 * 60 * 60;

// 月统计：无 TTL，永久保留
```

#### 更新策略（分层 + 异步聚合）

为避免热点问题，采用 **分层更新** 策略：

| 层级 | 更新方式 | 热点风险 | 说明 |
|------|----------|----------|------|
| Consumer | 实时 | 低 | 分散在每个用户 |
| Blueprint | 实时 | 低 | 分散在每个版本 |
| App / Producer | **异步聚合** | 高 → 已规避 | 通过 DynamoDB Streams 异步更新 |

**架构**：

```
Event/Automata 写入
      │
      ├─→ 实时更新 STATS#CONSUMER#xxx      (低热点)
      ├─→ 实时更新 STATS#BLUEPRINT#xxx     (低热点)
      │
      └─→ DynamoDB Streams
              │
              └─→ Lambda (批量聚合)
                      │
                      ├─→ 异步更新 STATS#APP#xxx
                      ├─→ 异步更新 STATS#APP#xxx#NAME#xxx
                      └─→ 异步更新 STATS#PRODUCER#xxx
```

**实时更新（低热点层级 + 时间分桶）**：

```typescript
// 获取时间分桶后缀
function getTimeBuckets(): { hour: string; day: string; month: string } {
  const now = new Date();
  return {
    hour: now.toISOString().slice(0, 13),   // "2024-01-20T10"
    day: now.toISOString().slice(0, 10),    // "2024-01-20"
    month: now.toISOString().slice(0, 7),   // "2024-01"
  };
}

// 创建 Automata 时 - 更新分散的统计（含时间维度）
async function onAutomataCreated(automata: Automata): Promise<void> {
  const { blueprintId, ownerAccountId } = automata;
  const { hour, day, month } = getTimeBuckets();
  
  await Promise.all([
    // 消费者侧：累计 + 时间分桶
    incrementStats(`STATS#CONSUMER#${ownerAccountId}`, 'automataCount'),
    incrementStats(`STATS#CONSUMER#${ownerAccountId}#HOUR#${hour}`, 'automataCount', { ttl: 7 * DAY }),
    incrementStats(`STATS#CONSUMER#${ownerAccountId}#DAY#${day}`, 'automataCount', { ttl: 90 * DAY }),
    incrementStats(`STATS#CONSUMER#${ownerAccountId}#MONTH#${month}`, 'automataCount'),
    
    // Blueprint 版本：累计 + 时间分桶
    incrementStats(`STATS#BLUEPRINT#${blueprintId}`, 'automataCount'),
    incrementStats(`STATS#BLUEPRINT#${blueprintId}#HOUR#${hour}`, 'automataCount', { ttl: 7 * DAY }),
    incrementStats(`STATS#BLUEPRINT#${blueprintId}#DAY#${day}`, 'automataCount', { ttl: 90 * DAY }),
    incrementStats(`STATS#BLUEPRINT#${blueprintId}#MONTH#${month}`, 'automataCount'),
  ]);
}

// 发送 Event 时 - 同样的模式
async function onEventCreated(event: Event, automata: Automata): Promise<void> {
  const { blueprintId, ownerAccountId } = automata;
  const { hour, day, month } = getTimeBuckets();
  
  await Promise.all([
    // 消费者侧
    incrementStats(`STATS#CONSUMER#${ownerAccountId}`, 'eventCount'),
    incrementStats(`STATS#CONSUMER#${ownerAccountId}#HOUR#${hour}`, 'eventCount', { ttl: 7 * DAY }),
    incrementStats(`STATS#CONSUMER#${ownerAccountId}#DAY#${day}`, 'eventCount', { ttl: 90 * DAY }),
    incrementStats(`STATS#CONSUMER#${ownerAccountId}#MONTH#${month}`, 'eventCount'),
    
    // Blueprint 版本
    incrementStats(`STATS#BLUEPRINT#${blueprintId}`, 'eventCount'),
    incrementStats(`STATS#BLUEPRINT#${blueprintId}#HOUR#${hour}`, 'eventCount', { ttl: 7 * DAY }),
    incrementStats(`STATS#BLUEPRINT#${blueprintId}#DAY#${day}`, 'eventCount', { ttl: 90 * DAY }),
    incrementStats(`STATS#BLUEPRINT#${blueprintId}#MONTH#${month}`, 'eventCount'),
  ]);
}
```

**异步聚合（高热点层级）**：

```typescript
// DynamoDB Streams Lambda - 批量聚合
async function aggregateStats(records: DynamoDBRecord[]): Promise<void> {
  // 按 App/Producer 分组，批量更新
  const appDeltas = new Map<string, { automata: number; events: number }>();
  const producerDeltas = new Map<string, { automata: number; events: number }>();
  
  for (const record of records) {
    if (record.eventName === 'INSERT' && isAutomataRecord(record)) {
      const { blueprintId } = record.dynamodb.NewImage;
      const [appId, name] = parseBlueprintId(blueprintId);
      const producerId = await getAppOwner(appId);
      
      // 累加 delta
      accumulate(appDeltas, appId, { automata: 1, events: 0 });
      accumulate(appDeltas, `${appId}#NAME#${name}`, { automata: 1, events: 0 });
      accumulate(producerDeltas, producerId, { automata: 1, events: 0 });
    }
    
    if (record.eventName === 'INSERT' && isEventRecord(record)) {
      // 类似逻辑，累加 event delta
    }
  }
  
  // 批量更新（合并多次写入为一次）
  await batchUpdateStats(appDeltas, 'APP');
  await batchUpdateStats(producerDeltas, 'PRODUCER');
}
```

**批量聚合的优势**：

| 场景 | 无聚合 | 有聚合 |
|------|--------|--------|
| 1 秒内 10,000 个 Event | 10,000 次写入 | ~1 次写入（批量合并） |
| 热点风险 | 高 | 低 |

#### 备选方案：写分片

如果需要更强的实时性，可以使用写分片：

```typescript
const SHARD_COUNT = 10;

function getShardedStatsKey(baseKey: string): string {
  const shard = Math.floor(Math.random() * SHARD_COUNT);
  return `${baseKey}#SHARD#${shard}`;
}

// 写入时随机分片
await incrementStats(getShardedStatsKey(`STATS#APP#${appId}`), 'eventCount');

// 读取时聚合所有分片
async function getAppStats(appId: string): Promise<Stats> {
  const shardKeys = Array.from({ length: SHARD_COUNT }, (_, i) => 
    `STATS#APP#${appId}#SHARD#${i}`
  );
  const shards = await batchGet(shardKeys);
  return aggregateShards(shards);
}
```

#### 查询统计 - 消费者侧（计费）

**查询累计值**：

```http
GET /account/usage
Authorization: Bearer {token}
```

**响应**:

```json
{
  "accountId": "7kj8m9nX2pQ...",
  "role": "consumer",
  "automataCount": 100,
  "eventCount": 5000,
  "lastActivityAt": "2024-01-20T10:00:00Z"
}
```

**查询时间范围（按月计费）**：

```http
GET /account/usage?granularity=month&from=2024-01&to=2024-03
Authorization: Bearer {token}
```

**响应**:

```json
{
  "accountId": "7kj8m9nX2pQ...",
  "role": "consumer",
  "granularity": "month",
  "from": "2024-01",
  "to": "2024-03",
  "data": [
    { "period": "2024-01", "automataCount": 30, "eventCount": 1500 },
    { "period": "2024-02", "automataCount": 35, "eventCount": 1800 },
    { "period": "2024-03", "automataCount": 35, "eventCount": 1700 }
  ],
  "total": {
    "automataCount": 100,
    "eventCount": 5000
  }
}
```

**查询每日趋势**：

```http
GET /account/usage?granularity=day&from=2024-01-15&to=2024-01-20
Authorization: Bearer {token}
```

**查询每小时（实时监控）**：

```http
GET /account/usage?granularity=hour&from=2024-01-20T00&to=2024-01-20T23
Authorization: Bearer {token}
```

#### 查询统计 - 生产者侧（分成）

```http
GET /account/revenue
Authorization: Bearer {token}
```

**响应**:

```json
{
  "accountId": "7kj8m9nX2pQ...",
  "role": "producer",
  "totalAutomataCount": 1234,
  "totalEventCount": 56789,
  "apps": [
    {
      "appId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "name": "Counter App",
      "automataCount": 1234,
      "eventCount": 56789
    }
  ],
  "lastActivityAt": "2024-01-20T10:00:00Z"
}
```

#### 查询统计 - App 详情

```http
GET /stats/apps/{appId}
Authorization: Bearer {token}
```

**响应**:

```json
{
  "appId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "automataCount": 1234,
  "eventCount": 56789,
  "blueprints": [
    {
      "name": "SimpleCounter",
      "automataCount": 800,
      "eventCount": 40000,
      "versions": [
        { "hash": "8mX2kj9nPqR", "automataCount": 500, "eventCount": 25000 },
        { "hash": "7kj8m9nX2pQ", "automataCount": 300, "eventCount": 15000 }
      ]
    }
  ],
  "lastActivityAt": "2024-01-20T10:00:00Z"
}
```

---

## 三、Blueprint 规范

Blueprint 定义状态机的模板，是**隐式实体**。

- **隐式**：用户无需显式创建 Blueprint，系统在创建 Automata 时自动处理
- **去重存储**：相同内容的 Blueprint 只存储一份，多个 Automata 共享引用
- **审计节点**：通过 Blueprint ID 可追溯到开发者和 App

### 3.1 Blueprint 实体（隐式）

#### 不可变属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `blueprintId` | string | 主键，= `{appId}:{name}:{hash}` |
| `appId` | string | 归属的 App（automataId）或 `SYSTEM` |
| `name` | string | Blueprint 名称 |
| `signature` | string? | 开发者的 Ed25519 签名，Builtin 时为 null |
| `creatorAccountId` | string | 首次创建该 Blueprint 的 Account |
| `content` | object | Blueprint 完整内容 |
| `createdAt` | ISO8601 | 首次创建时间 |

#### 使用统计

Blueprint 的使用统计通过 Stats 实体管理，不在 Blueprint 中冗余存储：

```typescript
// 查询 Blueprint 使用量
const stats = await getStats(`STATS#BLUEPRINT#${blueprintId}`);
// stats.automataCount, stats.eventCount
```

### 3.2 Blueprint 内容结构

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
  transition: string;                   // JSONata 转换表达式
  initialState: unknown;                // 初始状态
}
```

### 3.3 Blueprint ID

Blueprint ID 由三部分组成：`{appId}:{name}:{hash}`

```typescript
function computeBlueprintId(blueprint: Blueprint): string {
  const content = canonicalize(blueprint);  // 规范化 JSON
  const hash = base62.encode(xxhash64(content));  // 约 11 字符
  return `${blueprint.appId}:${blueprint.name}:${hash}`;
}
```

**示例**：

- 用户 Blueprint：`01ARZ3NDEKTSV:Counter:8mX2kj9nPqR`
- 系统 Blueprint：`SYSTEM:AppRegistry:7kj8m9nX2pQ`

### 3.4 Blueprint 签名

开发者使用自己的私钥对 Blueprint 进行签名：

```typescript
function signBlueprint(blueprint: Blueprint, privateKey: Ed25519PrivateKey): string {
  const content = canonicalize(blueprint);
  const signature = ed25519.sign(content, privateKey);
  return base64url.encode(signature);
}
```

验证时：

1. 解析 `blueprintId`，提取 `appId`
2. 查询 `appId` 对应的 Automata，获取 `ownerAccountId`
3. 查询 Account，获取 `publicKey`
4. 验证签名

### 3.5 Blueprint 生命周期

#### 创建 Automata 时的 Blueprint 处理

```typescript
async function handleBlueprintOnCreateAutomata(
  blueprint: BlueprintContent,
  signature: string | null,
  creatorAccountId: string
): Promise<string> {
  const blueprintId = computeBlueprintId(blueprint);
  
  // 1. 检查 Blueprint 是否已存在
  const existing = await getBlueprint(blueprintId);
  
  if (existing) {
    // 已存在：直接复用，无需再次验证签名
    // 使用统计由 Stats 实体管理，在 onAutomataCreated 中更新
    return blueprintId;
  }
  
  // 2. 不存在：验证签名并创建
  await validateBlueprintSignature(blueprint, signature);
  
  await createBlueprint({
    blueprintId,
    appId: blueprint.appId,
    name: blueprint.name,
    signature,
    creatorAccountId,
    content: blueprint,
    createdAt: new Date().toISOString()
  });
  
  return blueprintId;
}
```

#### 存储优化效果

| 场景 | 无去重存储 | 有去重存储 |
|------|-----------|-----------|
| 1000 个 Automata 使用同一 Blueprint (10KB) | 10 MB | 10 KB + 1000 × ~50 bytes 引用 |
| 节省 | - | ~99.5% |

### 3.6 Builtin Blueprints

系统提供内置 Blueprint，无需签名，只需验证 hash。

#### AppRegistry Blueprint

```typescript
const APP_REGISTRY_BLUEPRINT: Blueprint = {
  appId: "SYSTEM",
  name: "AppRegistry",
  description: "System builtin blueprint for app registration",
  
  stateSchema: {
    type: "object",
    properties: {
      name: { type: "string", maxLength: 100 },
      description: { type: "string", maxLength: 1000 },
      iconUrl: { type: "string", format: "uri" },
      websiteUrl: { type: "string", format: "uri" },
      status: { enum: ["draft", "published", "archived"] }
    },
    required: ["name", "status"]
  },
  
  eventSchemas: {
    SET_INFO: {
      type: "object",
      properties: {
        name: { type: "string", maxLength: 100 },
        description: { type: "string", maxLength: 1000 },
        iconUrl: { type: "string", format: "uri" },
        websiteUrl: { type: "string", format: "uri" }
      }
    },
    PUBLISH: { type: "object" },
    UNPUBLISH: { type: "object" },
    ARCHIVE: { type: "object" }
  },
  
  initialState: {
    name: "Untitled App",
    status: "draft"
  },
  
  transition: `
    $event.type = 'SET_INFO' ? $merge([$state, $event.data]) :
    $event.type = 'PUBLISH' ? $merge([$state, { "status": "published" }]) :
    $event.type = 'UNPUBLISH' ? $merge([$state, { "status": "draft" }]) :
    $event.type = 'ARCHIVE' ? $merge([$state, { "status": "archived" }]) :
    $state
  `
};
```

#### 识别 Builtin Blueprint

```typescript
function isBuiltinBlueprint(blueprintId: string): boolean {
  return blueprintId.startsWith("SYSTEM:");
}
```

### 3.7 统计层级

通过 Blueprint ID 的三层结构，支持四级统计：

| 层级 | 查询方式 | 说明 |
|------|----------|------|
| Account | `App.ownerAccountId = X` → 聚合 | 开发者的所有 App 总共创建了多少 Automata |
| App | `blueprintId BEGINS_WITH "${appId}:"` | 某 App 下所有 Blueprint 创建的 Automata 数 |
| Blueprint Name | `blueprintId BEGINS_WITH "${appId}:${name}:"` | 某 Blueprint（所有版本）创建的 Automata 数 |
| Blueprint Version | `blueprintId = "${appId}:${name}:${hash}"` | 特定版本创建的 Automata 数 |

---

## 四、安全机制

### 4.1 认证体系

#### AWS Cognito 集成

平台使用 **AWS Cognito User Pool** 作为统一认证服务：

```
用户登录流程:
┌─────────────────────────────────────────────────────────────┐
│  User → Cognito Hosted UI → Google/GitHub IdP              │
│       ← Cognito JWT (id_token, access_token)               │
└─────────────────────────────────────────────────────────────┘

首次注册流程:
┌─────────────────────────────────────────────────────────────┐
│  1. 用户用 Cognito JWT 调用 POST /accounts                  │
│  2. 请求 body 包含用户生成的 Ed25519 publicKey              │
│  3. 后端验证 JWT，用 Cognito sub 创建 Account               │
│  4. accountId = Base62(MurmurHash128(publicKey))           │
└─────────────────────────────────────────────────────────────┘
```

**Cognito 优势**：

| 特性 | 说明 |
|------|------|
| **托管 OAuth** | 无需自己实现 OAuth 流程 |
| **多 IdP 支持** | Google, GitHub, Facebook, SAML 等 |
| **JWT 发放** | 自动发放并签名 JWT |
| **AWS 集成** | 与 API Gateway Authorizer 无缝集成 |

#### Cognito JWT Claims

```json
{
  "iss": "https://cognito-idp.{region}.amazonaws.com/{userPoolId}",
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "aud": "{clientId}",
  "exp": 1735689600,
  "iat": 1735686000,
  "token_use": "id",
  "email": "user@example.com",
  "name": "User Name",
  "picture": "https://...",
  "identities": [
    {
      "providerName": "Google",
      "userId": "123456789"
    }
  ]
}
```

| Claim | 说明 |
|-------|------|
| `sub` | Cognito 用户 ID (UUID) |
| `email` | 用户邮箱 |
| `name` | 显示名称 |
| `picture` | 头像 URL |
| `identities` | 外部 IdP 身份信息 |

#### 数据来源分离

| 来源 | 字段 |
|------|------|
| **Cognito JWT** | `sub` (oauthSubject), `email`, `name`, `picture` |
| **用户提供** | `publicKey` (Ed25519, 用于请求签名) |
| **系统生成** | `accountId` = Base62(MurmurHash128(publicKey)) |

#### 自定义 Claims（Post-Authentication Lambda）

首次登录后，通过 Post-Authentication Lambda 将 `accountId` 注入到 JWT：

```json
{
  "custom:account_id": "7kj8m9nX2pQ...",
  "custom:spk": "base64url-encoded-session-public-key"
}
```

| Custom Claim | 说明 |
|--------------|------|
| `custom:account_id` | Automabase Account ID |
| `custom:spk` | Session Public Key (Ed25519, 32 bytes, Base64URL) |

### 4.2 请求签名机制

所有写操作请求需要签名，防止篡改。

#### 必需的 Headers

| Header | 说明 |
|--------|------|
| `Authorization` | `Bearer {jwt-token}` |
| `X-Request-Id` | 请求 ID，ULID 格式 |
| `X-Request-Timestamp` | 请求时间戳，ISO8601 格式 |
| `X-Request-Signature` | Ed25519 签名，Base64URL 编码 |

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

### 4.3 防重放攻击

| 机制 | 说明 |
|------|------|
| Request ID 去重 | 缓存 5 分钟内的 Request ID，拒绝重复 |
| Timestamp 验证 | 请求时间戳与服务器时间差不超过 5 分钟 |
| JWT 过期检查 | 验证 `exp` claim |

### 4.4 Blueprint 签名验证

创建 Automata 时，系统验证 Blueprint：

```typescript
async function validateAndGetBlueprint(
  blueprint: BlueprintContent,
  signature: string | null
): Promise<string> {
  const blueprintId = computeBlueprintId(blueprint);
  
  // 1. 检查 Blueprint 是否已存在（已验证过签名）
  const existing = await getBlueprint(blueprintId);
  if (existing) {
    // 已存在：复用，无需再次验证
    return blueprintId;
  }
  
  // 2. 不存在：需要验证签名
  
  // 2.1 Builtin Blueprint：验证 hash 匹配
  if (isBuiltinBlueprint(blueprintId)) {
    const builtin = BUILTIN_BLUEPRINTS[blueprint.name];
    if (!builtin) throw new Error('Unknown builtin blueprint');
    if (computeHash(blueprint) !== computeHash(builtin)) {
      throw new Error('Builtin blueprint hash mismatch');
    }
    return blueprintId;
  }
  
  // 2.2 用户 Blueprint：验证签名
  if (!signature) throw new Error('Signature required');
  
  // 获取 App 的 owner
  const app = await getAutomata(blueprint.appId);
  if (!app) throw new Error('App not found');
  
  // 获取 owner 的公钥
  const account = await getAccount(app.ownerAccountId);
  if (!account) throw new Error('Account not found');
  
  // 验证签名
  const content = canonicalize(blueprint);
  if (!ed25519.verify(signature, content, account.publicKey)) {
    throw new Error('Invalid signature');
  }
  
  return blueprintId;
}
```

---

## 五、API 规范

### 5.1 通用规范

- **Base URL**: `https://api.automabase.com/v1`
- **认证**: 所有请求需要 JWT + 请求签名
- **Account ID**: 从 JWT `account_id` claim 提取

### 5.2 Account API

#### 获取当前 Account

```http
GET /account
Authorization: Bearer {token}
```

**响应**:

```json
{
  "accountId": "7kj8m9nX2pQ...",
  "publicKey": "base64url-public-key",
  "displayName": "John Doe",
  "email": "john@example.com",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

#### 更新 Account

```http
PATCH /account
Authorization: Bearer {token}
X-Request-Id: {ulid}
X-Request-Timestamp: {iso8601}
X-Request-Signature: {signature}
Content-Type: application/json

{
  "displayName": "New Name",
  "email": "new@example.com"
}
```

---

### 5.3 App API

App 通过 Automata API 管理（使用 AppRegistry Blueprint）。

#### 创建 App

```http
POST /automatas
Authorization: Bearer {token}
X-Request-Id: {ulid}
X-Request-Timestamp: {iso8601}
X-Request-Signature: {signature}
Content-Type: application/json

{
  "blueprint": {
    "appId": "SYSTEM",
    "name": "AppRegistry",
    "stateSchema": { ... },
    "eventSchemas": { ... },
    "transition": "...",
    "initialState": { "name": "Untitled App", "status": "draft" }
  },
  "blueprintSignature": null,
  "initialEvent": {
    "eventType": "SET_INFO",
    "eventData": {
      "name": "My Counter App",
      "description": "A simple counter application"
    }
  }
}
```

**响应** (201 Created):

```json
{
  "automataId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "blueprintId": "SYSTEM:AppRegistry:7kj8m9nX2pQ",
  "currentState": {
    "name": "My Counter App",
    "description": "A simple counter application",
    "status": "draft"
  },
  "version": "000001",
  "createdAt": "2024-01-20T10:00:00Z"
}
```

#### 更新 App 信息

```http
POST /automatas/{appId}/events
Authorization: Bearer {token}
X-Request-Id: {ulid}
X-Request-Timestamp: {iso8601}
X-Request-Signature: {signature}
Content-Type: application/json

{
  "eventType": "SET_INFO",
  "eventData": {
    "name": "My Awesome Counter App",
    "description": "An even better counter"
  }
}
```

#### 发布 App

```http
POST /automatas/{appId}/events
Content-Type: application/json

{
  "eventType": "PUBLISH",
  "eventData": {}
}
```

---

### 5.4 Automata API

#### 创建 Automata

```http
POST /automatas
Authorization: Bearer {token}
X-Request-Id: {ulid}
X-Request-Timestamp: {iso8601}
X-Request-Signature: {signature}
Content-Type: application/json

{
  "blueprint": {
    "appId": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "name": "SimpleCounter",
    "stateSchema": {
      "type": "object",
      "properties": { "count": { "type": "number" } }
    },
    "eventSchemas": {
      "INCREMENT": { "type": "object" },
      "DECREMENT": { "type": "object" }
    },
    "initialState": { "count": 0 },
    "transition": "$merge([$state, { count: $state.count + ($event.type = 'INCREMENT' ? 1 : -1) }])"
  },
  "blueprintSignature": "base64url-ed25519-signature"
}
```

**响应** (201 Created):

```json
{
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "blueprintId": "01ARZ3NDEKTSV4RRFFQ69G5FAV:SimpleCounter:8mX2kj9nPqR",
  "currentState": { "count": 0 },
  "version": "000000",
  "createdAt": "2024-01-20T10:00:00Z"
}
```

#### 列出 Automatas

```http
GET /automatas?limit={n}&cursor={cursor}
Authorization: Bearer {token}
```

**响应**:

```json
{
  "automatas": [
    {
      "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
      "blueprintId": "01ARZ3NDEKTSV4RRFFQ69G5FAV:SimpleCounter:8mX2kj9nPqR",
      "blueprintName": "SimpleCounter",
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
Authorization: Bearer {token}
```

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

#### 查询 Automata 详情（含 Blueprint）

```http
GET /automatas/{automataId}
Authorization: Bearer {token}
```

**响应**:

```json
{
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "ownerAccountId": "7kj8m9nX2pQ...",
  "blueprintId": "01ARZ3NDEKTSV4RRFFQ69G5FAV:SimpleCounter:8mX2kj9nPqR",
  "blueprint": { ... },
  "blueprintSignature": "...",
  "currentState": { "count": 42 },
  "version": "00001a",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-20T10:00:00Z"
}
```

#### 归档 Automata

```http
PATCH /automatas/{automataId}
Authorization: Bearer {token}
X-Request-Id: {ulid}
X-Request-Timestamp: {iso8601}
X-Request-Signature: {signature}
Content-Type: application/json

{
  "status": "archived"
}
```

---

### 5.5 Event API

#### 发送 Event

```http
POST /automatas/{automataId}/events
Authorization: Bearer {token}
X-Request-Id: {ulid}
X-Request-Timestamp: {iso8601}
X-Request-Signature: {signature}
Content-Type: application/json

{
  "eventType": "INCREMENT",
  "eventData": { "amount": 1 }
}
```

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

#### 查询 Events

```http
GET /automatas/{automataId}/events?direction={forward|backward}&anchor={version}&limit={n}
Authorization: Bearer {token}
```

**参数**:

| 参数 | 说明 |
|------|------|
| `direction` | `forward`（从旧到新）或 `backward`（从新到旧） |
| `anchor` | 起始版本号（可选，默认从头/尾开始） |
| `limit` | 返回数量限制（默认 100，最大 1000） |

**响应**:

```json
{
  "events": [
    {
      "eventId": "event:01AN4Z07BY79KA1307SR9X4MV3:000001",
      "baseVersion": "000000",
      "eventType": "INCREMENT",
      "eventData": { "amount": 1 },
      "senderAccountId": "7kj8m9nX2pQ...",
      "timestamp": "2024-01-01T00:00:00Z"
    }
  ],
  "nextAnchor": "000010"
}
```

#### 查询单个 Event

```http
GET /automatas/{automataId}/events/{baseVersion}
Authorization: Bearer {token}
```

---

### 5.6 WebSocket API

#### 连接

```
wss://api.automabase.com/v1/ws?token={jwt}
```

#### 订阅 Automata

```json
{
  "action": "subscribe",
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3"
}
```

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

#### 上行消息: 发送 Event

```json
{
  "action": "sendEvent",
  "automataId": "01AN4Z07BY79KA1307SR9X4MV3",
  "eventType": "INCREMENT",
  "eventData": { "amount": 1 },
  "requestId": "{ulid}",
  "timestamp": "{iso8601}",
  "signature": "{signature}"
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

| Entity | PK | SK | GSI1PK | GSI1SK | GSI2PK | GSI2SK |
|--------|----|----|--------|--------|--------|--------|
| Account | `ACCOUNT#{accountId}` | `#META` | `OAUTH#{provider}#{subject}` | `#META` | - | - |
| Blueprint | `BLUEPRINT#{blueprintId}` | `#META` | `APP#{appId}` | `{createdAt}#{name}` | - | - |
| Automata | `AUTOMATA#{automataId}` | `#META` | `ACCOUNT#{ownerAccountId}` | `{createdAt}#{automataId}` | `APP#{appId}` | `{createdAt}#{automataId}` |
| Event | `AUTOMATA#{automataId}` | `EVT#{version}` | - | - | - | - |
| Snapshot | `AUTOMATA#{automataId}` | `SNAP#{version}` | - | - | - | - |
| Stats | `STATS#{statsId}` | `#META` | - | - | - | - |

**说明**：
- Automata 的 `appId` 从 `blueprintId` 解析得到（第一个 `:` 前的部分）
- GSI2 用于按 App 查询所有 Automata（统计、审计）

### 6.2 Automata 存储

Automata 作为显式实体存储：

```typescript
{
  pk: "AUTOMATA#01AN4Z07BY79KA1307SR9X4MV3",
  sk: "#META",
  automataId: "01AN4Z07BY79KA1307SR9X4MV3",
  ownerAccountId: "7kj8m9nX2pQ...",
  blueprintId: "01ARZ3NDEKTSV:Counter:8mX2kj9nPqR",
  appId: "01ARZ3NDEKTSV",  // 从 blueprintId 解析，冗余存储用于 GSI2
  currentState: { "count": 42 },
  version: "00001a",
  status: "active",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-20T10:00:00Z",
  
  // GSI1: 按用户查 Automata
  gsi1pk: "ACCOUNT#7kj8m9nX2pQ...",
  gsi1sk: "2024-01-01T00:00:00Z#01AN4Z07BY79KA1307SR9X4MV3",
  
  // GSI2: 按 App 查 Automata（统计/审计）
  gsi2pk: "APP#01ARZ3NDEKTSV",
  gsi2sk: "2024-01-01T00:00:00Z#01AN4Z07BY79KA1307SR9X4MV3"
}
```

### 6.3 Blueprint 存储

Blueprint 作为隐式实体存储（使用统计通过 Stats 实体管理）：

```typescript
{
  pk: "BLUEPRINT#01ARZ3NDEKTSV:Counter:8mX2kj9nPqR",
  sk: "#META",
  blueprintId: "01ARZ3NDEKTSV:Counter:8mX2kj9nPqR",
  appId: "01ARZ3NDEKTSV",
  name: "Counter",
  signature: "base64url-signature",
  creatorAccountId: "7kj8m9nX2pQ...",
  content: { /* BlueprintContent */ },
  createdAt: "2024-01-01T00:00:00Z",
  
  // GSI1: 按 App 查 Blueprint
  gsi1pk: "APP#01ARZ3NDEKTSV",
  gsi1sk: "2024-01-01T00:00:00Z#Counter"  // 按名称排序
}
// 使用统计：查询 STATS#BLUEPRINT#01ARZ3NDEKTSV:Counter:8mX2kj9nPqR
```

### 6.4 Stats 存储

Stats 作为隐式实体存储，分为消费者侧和生产者侧，每种都有时间分桶。

**消费者侧统计（计费）**：

```typescript
// 累计值
{
  pk: "STATS#CONSUMER#7kj8m9nX2pQ",
  sk: "#META",
  statsId: "CONSUMER#7kj8m9nX2pQ",
  automataCount: 100,
  eventCount: 5000,
  lastActivityAt: "2024-01-20T10:00:00Z",
  updatedAt: "2024-01-20T10:00:00Z"
}

// 月统计（永久保留）
{
  pk: "STATS#CONSUMER#7kj8m9nX2pQ#MONTH#2024-01",
  sk: "#META",
  statsId: "CONSUMER#7kj8m9nX2pQ#MONTH#2024-01",
  automataCount: 30,
  eventCount: 1500,
  lastActivityAt: "2024-01-31T23:59:00Z",
  updatedAt: "2024-01-31T23:59:00Z"
}

// 日统计（TTL 90 天）
{
  pk: "STATS#CONSUMER#7kj8m9nX2pQ#DAY#2024-01-20",
  sk: "#META",
  statsId: "CONSUMER#7kj8m9nX2pQ#DAY#2024-01-20",
  automataCount: 5,
  eventCount: 200,
  ttl: 1713571200,  // 90 天后过期
  lastActivityAt: "2024-01-20T23:59:00Z",
  updatedAt: "2024-01-20T23:59:00Z"
}

// 小时统计（TTL 7 天）
{
  pk: "STATS#CONSUMER#7kj8m9nX2pQ#HOUR#2024-01-20T10",
  sk: "#META",
  statsId: "CONSUMER#7kj8m9nX2pQ#HOUR#2024-01-20T10",
  automataCount: 1,
  eventCount: 50,
  ttl: 1706346000,  // 7 天后过期
  lastActivityAt: "2024-01-20T10:59:00Z",
  updatedAt: "2024-01-20T10:59:00Z"
}
```

**生产者侧统计（分成）**：

```typescript
// 开发者作为生产者的被使用量
{
  pk: "STATS#PRODUCER#7kj8m9nX2pQ",
  sk: "#META",
  statsId: "PRODUCER#7kj8m9nX2pQ",
  automataCount: 1234,     // 开发者的 Blueprint 被用于创建的 Automata 数
  eventCount: 56789,       // 这些 Automata 产生的 Event 数
  lastActivityAt: "2024-01-20T10:00:00Z",
  updatedAt: "2024-01-20T10:00:00Z"
}

// App 级别统计
{
  pk: "STATS#APP#01ARZ3NDEKTSV",
  sk: "#META",
  statsId: "APP#01ARZ3NDEKTSV",
  automataCount: 1234,
  eventCount: 56789,
  lastActivityAt: "2024-01-20T10:00:00Z",
  updatedAt: "2024-01-20T10:00:00Z"
}

// Blueprint Name 级别统计
{
  pk: "STATS#APP#01ARZ3NDEKTSV#NAME#Counter",
  sk: "#META",
  statsId: "APP#01ARZ3NDEKTSV#NAME#Counter",
  automataCount: 800,
  eventCount: 40000,
  lastActivityAt: "2024-01-20T10:00:00Z",
  updatedAt: "2024-01-20T10:00:00Z"
}

// Blueprint Version 级别统计
{
  pk: "STATS#BLUEPRINT#01ARZ3NDEKTSV:Counter:8mX2kj9nPqR",
  sk: "#META",
  statsId: "BLUEPRINT#01ARZ3NDEKTSV:Counter:8mX2kj9nPqR",
  automataCount: 500,
  eventCount: 25000,
  lastActivityAt: "2024-01-20T10:00:00Z",
  updatedAt: "2024-01-20T10:00:00Z"
}
```

### 6.5 Snapshot 存储

Snapshot 与 Event 共享 Automata 的 PK，通过 SK 前缀区分：

```typescript
{
  pk: "AUTOMATA#01AN4Z07BY79KA1307SR9X4MV3",
  sk: "SNAP#00003E",  // 版本 62 的快照
  version: "00003E",
  state: { "count": 62 },
  createdAt: "2024-01-15T10:00:00Z"
}
```

### 6.6 GSI 设计

#### GSI1: 多用途索引

| 用途 | PK | SK | 说明 |
|------|----|----|------|
| OAuth 查 Account | `OAUTH#{provider}#{subject}` | `#META` | 登录时查找 Account |
| Account 查 Automatas | `ACCOUNT#{accountId}` | `{createdAt}#{automataId}` | 用户列出自己的 Automata |
| App 查 Blueprints | `APP#{appId}` | `{createdAt}#{name}` | 开发者列出 App 下的 Blueprint |

#### GSI2: App 维度索引

| 用途 | PK | SK | 说明 |
|------|----|----|------|
| App 查 Automatas | `APP#{appId}` | `{createdAt}#{automataId}` | 统计某 App 下所有 Automata |

**查询示例**:

```typescript
// 1. 用户列出自己的 Automata
const myAutomatas = await query({
  IndexName: 'GSI1',
  KeyConditionExpression: 'gsi1pk = :pk',
  ExpressionAttributeValues: { ':pk': `ACCOUNT#${accountId}` },
  ScanIndexForward: false  // 最新的在前
});

// 2. 开发者列出 App 下的 Blueprints
const appBlueprints = await query({
  IndexName: 'GSI1',
  KeyConditionExpression: 'gsi1pk = :pk',
  ExpressionAttributeValues: { ':pk': `APP#${appId}` }
});

// 3. 统计某 App 下所有 Automata（审计/分成）
const appAutomatas = await query({
  IndexName: 'GSI2',
  KeyConditionExpression: 'gsi2pk = :pk',
  ExpressionAttributeValues: { ':pk': `APP#${appId}` }
});

// 4. 统计某 Blueprint 下所有 Automata
// 使用主表扫描 + 过滤（或依赖 Stats 实体）
const blueprintAutomatas = await query({
  IndexName: 'GSI2',
  KeyConditionExpression: 'gsi2pk = :pk AND begins_with(gsi2sk, :prefix)',
  ExpressionAttributeValues: { 
    ':pk': `APP#${appId}`,
    ':prefix': createdAt  // 时间范围过滤
  }
});
```

#### LSI1: Event 按类型查询（可选）

如果需要按事件类型查询，可添加 LSI：

| 用途 | PK | SK (LSI) |
|------|----|----|
| 按类型查 Events | `AUTOMATA#{automataId}` | `EVTYPE#{eventType}#{version}` |

```typescript
// 查询某 Automata 的所有 INCREMENT 事件
const incrementEvents = await query({
  TableName: 'AutomabaseTable',
  IndexName: 'LSI1',
  KeyConditionExpression: 'pk = :pk AND begins_with(lsi1sk, :prefix)',
  ExpressionAttributeValues: {
    ':pk': `AUTOMATA#${automataId}`,
    ':prefix': 'EVTYPE#INCREMENT#'
  }
});
```

### 6.7 Request ID 去重表 (RequestIdTable)

| PK | TTL |
|----|-----|
| `{requestId}` | `{currentTime + 5min}` |

使用 DynamoDB TTL 自动清理过期记录。

---

## 七、实施路线图

### Phase 0: 准备工作 ✅

- [x] 完成 v3.0 业务模型设计评审
- [x] **迁移现有代码到 v2 目录**
  ```bash
  # 创建 v2 目录结构
  mkdir -p v2
  
  # 移动现有代码作为参考
  mv apps v2/
  mv functions v2/
  mv packages v2/
  mv e2e v2/
  ```
- [x] **使用脚手架创建新的项目结构**
  ```bash
  # 创建核心包
  bun run create:package automata-core
  bun run create:package automata-auth
  bun run create:package automata-server
  bun run create:package automata-client
  
  # 创建 Lambda 函数
  bun run create:function automata-api
  bun run create:function automata-ws
  
  # 创建示例应用（可选）
  bun run create:webapp sample-app
  ```
- [x] 更新 monorepo 配置（package.json workspaces）
- [x] 更新 SAM 模板（template.yaml GSI 设计）

### Phase 1: 核心功能 (MVP)

- [x] **Account 管理** ✅
  - [x] AWS Cognito 集成（Google/GitHub IdP）
  - [x] Account 类型定义与 DynamoDB Repository
  - [x] Account API 端点 (GET/POST/PATCH)
  - [x] Cognito JWT 验证
  - [x] Base62 编码与 MurmurHash 工具函数

- [ ] **Blueprint 管理（隐式实体）**
  - [ ] Blueprint 去重存储
  - [ ] Blueprint 签名验证
  - [ ] Blueprint 复用逻辑

- [ ] **Automata 核心**
  - [ ] Automata CRUD（引用 blueprintId）
  - [ ] Event 处理
  - [ ] 状态转换（JSONata）

- [ ] **Builtin Blueprints**
  - [ ] AppRegistry Blueprint
  - [ ] Builtin hash 验证

### Phase 2: 增强安全

- [ ] **请求签名**
  - [ ] Canonical Request 构造
  - [ ] Ed25519 签名验证
  - [ ] 签名中间件

- [ ] **防重放**
  - [ ] Request ID 去重表
  - [ ] Timestamp 验证

### Phase 3: 高级功能

- [ ] **WebSocket**
  - [ ] 连接管理
  - [ ] 订阅/取消订阅
  - [ ] 状态推送
  - [ ] 上行发送 Event

- [ ] **统计与审计**
  - [ ] Blueprint 使用统计
  - [ ] App 统计
  - [ ] Event 统计

- [ ] **历史状态**
  - [ ] Snapshot 存储（每 62 版本）
  - [ ] 历史状态查询 API

---

## 附录

### A. Base62 编码

字符集: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz`

6 位 Base62 版本号范围: `000000` ~ `zzzzzz` (约 568 亿)

### B. Hash 算法

| 用途 | 算法 | 输出 | Base62 长度 |
|------|------|------|-------------|
| Account ID | MurmurHash3-128 | 128 bit | ~22 字符 |
| Blueprint Hash | xxHash64 | 64 bit | ~11 字符 |

### C. Event ID 格式

```
event:{automataId}:{baseVersion}
```

示例: `event:01ARZ3NDEKTSV4RRFFQ69G5FAV:00001a`

### D. Blueprint ID 格式

```
{appId}:{blueprintName}:{hash}
```

示例:

- 用户 Blueprint: `01ARZ3NDEKTSV4RRFFQ69G5FAV:SimpleCounter:8mX2kj9nPqR`
- 系统 Blueprint: `SYSTEM:AppRegistry:7kj8m9nX2pQ`

### E. 权限模型

v3.0 采用极简权限模型：

- 用户只能访问和修改自己 Account 下的 Automata
- 暂不支持共享机制
- 无需权限字

```typescript
function canAccess(account: Account, automata: Automata): boolean {
  return automata.ownerAccountId === account.accountId;
}
```

### F. 实体类型对比

| 实体 | 类型 | 创建方式 | 说明 |
|------|------|----------|------|
| Account | 显式 | 用户注册 | 用户身份 |
| Automata | 显式 | API 调用 | 状态机实例 |
| Event | 显式 | API 调用 | 状态转换事件 |
| Blueprint | **隐式** | 系统自动 | 创建 Automata 时自动去重存储 |
| Snapshot | **隐式** | 系统自动 | 每 62 版本自动创建状态快照 |
| Stats | **隐式** | 系统自动 | 创建 Automata/Event 时更新统计 |

**隐式实体的特点**：

| 隐式实体 | 触发条件 | 用途 |
|----------|----------|------|
| Blueprint | 创建 Automata 时 | 去重存储，共享模板 |
| Snapshot | 每 62 个 Event 后 | 快速恢复历史状态 |
| Stats | 创建 Automata/Event 时 | 快速查询审计统计 |

**共同特点**：

1. 用户无需显式调用创建 API
2. 系统自动管理生命周期
3. 对用户透明，查询时自动关联

