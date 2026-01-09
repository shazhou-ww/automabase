/**
 * Automata Repository
 *
 * 管理 Automata 的 CRUD 操作
 */

import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { docClient, getTableName, Keys } from './client';
import { parseBlueprintId } from '../types/blueprint';
import { INITIAL_VERSION } from '../utils/base62';
import type {
  Automata,
  AutomataItem,
  CreateAutomataInput,
  UpdateAutomataInput,
} from '../types/automata';

/**
 * 将 DynamoDB Item 转换为 Automata
 */
function itemToAutomata(item: AutomataItem): Automata {
  return {
    automataId: item.automataId,
    ownerAccountId: item.ownerAccountId,
    blueprintId: item.blueprintId,
    appId: item.appId,
    currentState: item.currentState,
    version: item.version,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * 根据 ID 获取 Automata
 */
export async function getAutomataById(automataId: string): Promise<Automata | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.automataPk(automataId),
        sk: Keys.metaSk(),
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  return itemToAutomata(result.Item as AutomataItem);
}

/**
 * 创建 Automata
 */
export async function createAutomata(input: CreateAutomataInput): Promise<Automata> {
  const automataId = ulid();
  const now = new Date().toISOString();

  // 从 blueprintId 解析 appId
  const { appId } = parseBlueprintId(input.blueprintId);

  const item: AutomataItem = {
    // Keys
    pk: Keys.automataPk(automataId),
    sk: Keys.metaSk(),
    gsi1pk: Keys.accountAutomataGsi1pk(input.ownerAccountId),
    gsi1sk: `${now}#${automataId}`,
    gsi2pk: Keys.appGsi2pk(appId),
    gsi2sk: `${now}#${automataId}`,

    // Automata fields
    automataId,
    ownerAccountId: input.ownerAccountId,
    blueprintId: input.blueprintId,
    appId,
    currentState: input.initialState,
    version: INITIAL_VERSION,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: getTableName(),
      Item: item,
    })
  );

  return itemToAutomata(item);
}

/**
 * 更新 Automata
 */
export async function updateAutomata(
  automataId: string,
  input: UpdateAutomataInput
): Promise<Automata | null> {
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  if (input.currentState !== undefined) {
    updateExpressions.push('#currentState = :currentState');
    expressionAttributeNames['#currentState'] = 'currentState';
    expressionAttributeValues[':currentState'] = input.currentState;
  }

  if (input.version !== undefined) {
    updateExpressions.push('#version = :version');
    expressionAttributeNames['#version'] = 'version';
    expressionAttributeValues[':version'] = input.version;
  }

  if (input.status !== undefined) {
    updateExpressions.push('#status = :status');
    expressionAttributeNames['#status'] = 'status';
    expressionAttributeValues[':status'] = input.status;
  }

  if (updateExpressions.length === 0) {
    return getAutomataById(automataId);
  }

  // Always update updatedAt
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.automataPk(automataId),
        sk: Keys.metaSk(),
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })
  );

  if (!result.Attributes) {
    return null;
  }

  return itemToAutomata(result.Attributes as AutomataItem);
}

/**
 * 按 Account 查询 Automatas
 */
export async function getAutomatasByAccount(
  accountId: string,
  options?: {
    limit?: number;
    cursor?: string;
  }
): Promise<{
  automatas: Automata[];
  nextCursor?: string;
}> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'gsi1-multipurpose-index',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: {
        ':pk': Keys.accountAutomataGsi1pk(accountId),
      },
      Limit: options?.limit || 100,
      ExclusiveStartKey: options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64url').toString())
        : undefined,
      ScanIndexForward: false, // 最新的在前
    })
  );

  const automatas = (result.Items || [])
    .filter((item) => (item.pk as string).startsWith('AUTOMATA#'))
    .map((item) => itemToAutomata(item as AutomataItem));

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
    : undefined;

  return { automatas, nextCursor };
}

/**
 * 按 App 查询 Automatas
 */
export async function getAutomatasByApp(
  appId: string,
  options?: {
    limit?: number;
    cursor?: string;
  }
): Promise<{
  automatas: Automata[];
  nextCursor?: string;
}> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'gsi2-app-automata-index',
      KeyConditionExpression: 'gsi2pk = :pk',
      ExpressionAttributeValues: {
        ':pk': Keys.appGsi2pk(appId),
      },
      Limit: options?.limit || 100,
      ExclusiveStartKey: options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64url').toString())
        : undefined,
      ScanIndexForward: false,
    })
  );

  const automatas = (result.Items || []).map((item) => itemToAutomata(item as AutomataItem));

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
    : undefined;

  return { automatas, nextCursor };
}

