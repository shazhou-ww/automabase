# WebSocket 本地调试（SAM + Local WS Gateway）

SAM CLI 目前无法本地模拟 API Gateway WebSocket 的 `$connect / $disconnect / $default`。
本仓库采用的可行方案是：

- 本地启动一个 WebSocket Server（用于真实 ws 客户端连接）
- 同时暴露一个最小版的 **Management API**（`POST /@connections/{id}`），让 Lambda 内的 `ApiGatewayManagementApiClient(PostToConnectionCommand)` 在本地也能“回推消息”
- 通过本地 gateway 触发 Lambda handler 的 `$connect/$default/$disconnect`（默认 **direct** 模式直接调用 handler；也支持 **sam** 模式）

## 1) 一次性准备

- 生成本地 JWT 验证密钥（写入 env.json）
  - `bun run keygen`
- 准备本地 DynamoDB（如果你要走完整的 ws token / connection / subscription 流程）
  - 推荐：启动 DynamoDB Local（Docker）
  - 然后：`bun run setup:db`

## 2) 启动本地 HTTP API（用于获取 ws token）

- `bun run sam:local`

这会启动 `sam local start-api`（HTTP API），你可以调用：

- `POST http://localhost:3000/v1/ws/token`

注意：这个接口需要 JWT；本仓库支持本地验证（`LOCAL_JWT_PUBLIC_KEY`）。

### 生成本地 Bearer JWT（手工调试用）

- `bun run jwt:local`

它会输出一行：`Bearer <jwt>`。

## 3) 启动本地 WebSocket Gateway

- `bun run ws:local`

默认监听：

- WebSocket：`ws://localhost:3000`
- Management API：`http://localhost:3000/@connections/{connectionId}`

本地调试建议确保：

- `WEBSOCKET_API_ENDPOINT=http://localhost:3000`

建议在 `env.json` 里同时给以下函数配置该变量：

- `AutomataApiFunction`（负责广播 state update）
- `AutomataWsFunction`（负责处理 ws 消息 + 发送 error/pong 等）

这样无论是 WebSocket Lambda 还是其它 Lambda 里调用 `broadcastStateUpdate(..., { wsEndpoint })`，都会把消息发回本地 gateway，再转发给真实 ws client。

## 4) 用 wscat / 客户端连接

1) 先拿一次性 ws token：

- `JWT=$(bun run jwt:local)`
- `curl -X POST http://localhost:3000/v1/ws/token -H "Authorization: $JWT"`

1) 用 token 连接 ws：

- `wscat -c "ws://localhost:3000?token=<wsToken>"`

1) 发消息（示例）：

- `{"action":"ping"}`
- `{"action":"subscribe","automataId":"..."}`

## 5) 运行模式

本地 gateway 支持两种 Lambda 调用方式：

- `WS_LAMBDA_MODE=direct`（默认）：直接 `import functions/automata-ws/src/index.ts` 并调用 handler，启动最快
- `WS_LAMBDA_MODE=sam`：每次消息触发时调用 `sam local invoke`（更贴近容器运行环境，但更慢）

示例：

- `WS_LAMBDA_MODE=sam bun run ws:local`

前提：你已生成 `merged-template.yaml`（例如先跑一次 `bun run sam:build`）。
