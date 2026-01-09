/**
 * Event Repository
 *
 * 管理 Event 的创建和查询
 */

import { PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName, Keys } from './client';
import type {
  AutomataEvent,
  EventItem,
  CreateEventInput,
  QueryEventsInput,
  QueryEventsResult,
} from '../types/event';

/**
 * 将 DynamoDB Item 转换为 Event
 */
function itemToEvent(item: EventItem): AutomataEvent {
  return {
    automataId: item.automataId,
    baseVersion: item.baseVersion,
    eventType: item.eventType,
    eventData: item.eventData,
    senderAccountId: item.senderAccountId,
    timestamp: item.timestamp,
  };
}

/**
 * 创建 Event
 *
 * 注意：调用此函数前应先验证并更新 Automata 的版本
 */
export async function createEvent(
  input: CreateEventInput,
  baseVersion: string
): Promise<AutomataEvent> {
  const now = new Date().toISOString();

  const item: EventItem = {
    // Keys
    pk: Keys.automataPk(input.automataId),
    sk: Keys.eventSk(baseVersion),
    lsi1sk: Keys.eventTypeLsi1sk(input.eventType, baseVersion),

    // Event fields
    automataId: input.automataId,
    baseVersion,
    eventType: input.eventType,
    eventData: input.eventData,
    senderAccountId: input.senderAccountId,
    timestamp: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: getTableName(),
      Item: item,
      // 确保不覆盖已存在的 Event（乐观锁）
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    })
  );

  return itemToEvent(item);
}

/**
 * 获取单个 Event
 */
export async function getEvent(
  automataId: string,
  baseVersion: string
): Promise<AutomataEvent | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.automataPk(automataId),
        sk: Keys.eventSk(baseVersion),
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  return itemToEvent(result.Item as EventItem);
}

/**
 * 查询 Events
 */
export async function queryEvents(input: QueryEventsInput): Promise<QueryEventsResult> {
  const { automataId, direction = 'forward', anchor, limit = 100 } = input;

  // 构建查询条件
  let keyConditionExpression = 'pk = :pk';
  const expressionAttributeValues: Record<string, unknown> = {
    ':pk': Keys.automataPk(automataId),
  };

  // 只查询 EVT# 前缀的记录
  keyConditionExpression += ' AND begins_with(sk, :skPrefix)';
  expressionAttributeValues[':skPrefix'] = 'EVT#';

  // 如果有锚点，添加范围条件
  if (anchor) {
    if (direction === 'forward') {
      keyConditionExpression = 'pk = :pk AND sk > :anchor';
      expressionAttributeValues[':anchor'] = Keys.eventSk(anchor);
    } else {
      keyConditionExpression = 'pk = :pk AND sk < :anchor';
      expressionAttributeValues[':anchor'] = Keys.eventSk(anchor);
    }
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: limit,
      ScanIndexForward: direction === 'forward',
    })
  );

  const events = (result.Items || [])
    .filter((item) => (item.sk as string).startsWith('EVT#'))
    .map((item) => itemToEvent(item as EventItem));

  // 计算下一页锚点
  let nextAnchor: string | undefined;
  if (events.length === limit && result.LastEvaluatedKey) {
    nextAnchor = events[events.length - 1].baseVersion;
  }

  return { events, nextAnchor };
}

/**
 * 按事件类型查询 Events（使用 LSI）
 */
export async function queryEventsByType(
  automataId: string,
  eventType: string,
  options?: {
    limit?: number;
    cursor?: string;
  }
): Promise<QueryEventsResult> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'lsi1-event-type-index',
      KeyConditionExpression: 'pk = :pk AND begins_with(lsi1sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': Keys.automataPk(automataId),
        ':prefix': `EVTYPE#${eventType}#`,
      },
      Limit: options?.limit || 100,
      ExclusiveStartKey: options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64url').toString())
        : undefined,
      ScanIndexForward: true,
    })
  );

  const events = (result.Items || []).map((item) => itemToEvent(item as EventItem));

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
    : undefined;

  return {
    events,
    nextAnchor: nextCursor,
  };
}

/**
 * 获取 Automata 的 Events 数量（用于版本验证）
 */
export async function getEventCount(automataId: string): Promise<number> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': Keys.automataPk(automataId),
        ':skPrefix': 'EVT#',
      },
      Select: 'COUNT',
    })
  );

  return result.Count || 0;
}

