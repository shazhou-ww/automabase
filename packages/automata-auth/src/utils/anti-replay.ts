/**
 * 防重放保护
 *
 * 使用 Request ID 和 Timestamp 验证请求的唯一性和时效性
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

/**
 * 防重放验证错误
 */
export class AntiReplayError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'AntiReplayError';
  }
}

/**
 * 防重放配置
 */
export interface AntiReplayConfig {
  /** DynamoDB 表名 */
  tableName: string;

  /** 时间窗口（秒），默认 5 分钟 */
  windowSeconds?: number;

  /** TTL（秒），用于自动清理，默认 10 分钟 */
  ttlSeconds?: number;
}

/**
 * 请求 ID 记录
 */
interface RequestIdRecord {
  pk: string; // REQUEST#{requestId}
  sk: string; // #META
  accountId: string;
  timestamp: string;
  ttl: number; // Unix timestamp for DynamoDB TTL
}

// 懒加载 DynamoDB 客户端
let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const client = new DynamoDBClient({});
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

/**
 * 验证 Timestamp 是否在有效窗口内
 *
 * @param timestamp - ISO 8601 格式的时间戳
 * @param windowSeconds - 时间窗口（秒）
 */
export function validateTimestamp(timestamp: string | undefined, windowSeconds: number = 300): void {
  if (!timestamp) {
    throw new AntiReplayError('Missing X-Request-Timestamp header', 'MISSING_TIMESTAMP');
  }

  const requestTime = new Date(timestamp).getTime();

  if (isNaN(requestTime)) {
    throw new AntiReplayError('Invalid timestamp format', 'INVALID_TIMESTAMP');
  }

  const now = Date.now();
  const diff = Math.abs(now - requestTime);
  const maxDiff = windowSeconds * 1000;

  if (diff > maxDiff) {
    throw new AntiReplayError(
      `Request timestamp is outside allowed window (${windowSeconds}s)`,
      'TIMESTAMP_EXPIRED'
    );
  }
}

/**
 * 验证 Request ID 唯一性（并记录）
 *
 * @param requestId - 请求 ID
 * @param accountId - 账户 ID
 * @param timestamp - 请求时间戳
 * @param config - 配置
 */
export async function validateAndRecordRequestId(
  requestId: string | undefined,
  accountId: string,
  timestamp: string,
  config: AntiReplayConfig
): Promise<void> {
  if (!requestId) {
    throw new AntiReplayError('Missing X-Request-Id header', 'MISSING_REQUEST_ID');
  }

  // UUID 格式验证（简单验证）
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new AntiReplayError('Invalid X-Request-Id format, expected UUID', 'INVALID_REQUEST_ID');
  }

  const ttlSeconds = config.ttlSeconds ?? 600; // 默认 10 分钟
  const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;

  const record: RequestIdRecord = {
    pk: `REQUEST#${requestId}`,
    sk: '#META',
    accountId,
    timestamp,
    ttl,
  };

  try {
    // 使用条件写入，确保 Request ID 未被使用过
    await getDocClient().send(
      new PutCommand({
        TableName: config.tableName,
        Item: record,
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new AntiReplayError('Duplicate request ID (potential replay attack)', 'DUPLICATE_REQUEST_ID');
    }
    throw error;
  }
}

/**
 * 完整的防重放验证
 *
 * @param requestId - X-Request-Id 头
 * @param timestamp - X-Request-Timestamp 头
 * @param accountId - 账户 ID
 * @param config - 配置
 */
export async function validateAntiReplay(
  requestId: string | undefined,
  timestamp: string | undefined,
  accountId: string,
  config: AntiReplayConfig
): Promise<void> {
  const windowSeconds = config.windowSeconds ?? 300;

  // 1. 验证时间戳
  validateTimestamp(timestamp, windowSeconds);

  // 2. 验证并记录 Request ID
  await validateAndRecordRequestId(requestId, accountId, timestamp!, config);
}

/**
 * 检查 Request ID 是否已存在（用于只读检查）
 */
export async function isRequestIdUsed(
  requestId: string,
  tableName: string
): Promise<boolean> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: `REQUEST#${requestId}`,
        sk: '#META',
      },
    })
  );

  return !!result.Item;
}

