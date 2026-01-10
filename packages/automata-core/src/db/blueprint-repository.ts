/**
 * Blueprint Repository
 *
 * 管理 Blueprint 的去重存储和查询。
 * Blueprint 是隐式实体，在创建 Automata 时自动去重存储。
 */

import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName, Keys } from './client';
import { computeBlueprintId } from '../utils/hash';
import type {
  Blueprint,
  BlueprintItem,
  CreateBlueprintInput,
} from '../types/blueprint';

/**
 * 将 DynamoDB Item 转换为 Blueprint
 */
function itemToBlueprint(item: BlueprintItem): Blueprint {
  return {
    blueprintId: item.blueprintId,
    appId: item.appId,
    name: item.name,
    description: item.description,
    state: item.state,
    events: item.events,
    signature: item.signature,
    creatorAccountId: item.creatorAccountId,
    createdAt: item.createdAt,
  };
}

/**
 * 根据 ID 获取 Blueprint
 */
export async function getBlueprintById(blueprintId: string): Promise<Blueprint | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.blueprintPk(blueprintId),
        sk: Keys.metaSk(),
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  return itemToBlueprint(result.Item as BlueprintItem);
}

/**
 * 创建 Blueprint（如果不存在）
 *
 * 使用 condition expression 确保不覆盖已存在的 Blueprint
 *
 * @returns Blueprint ID
 */
export async function createBlueprintIfNotExists(input: CreateBlueprintInput): Promise<string> {
  const blueprintId = await computeBlueprintId(input.content);
  const now = new Date().toISOString();

  const item: BlueprintItem = {
    // Keys
    pk: Keys.blueprintPk(blueprintId),
    sk: Keys.metaSk(),
    gsi1pk: Keys.appGsi1pk(input.content.appId),
    gsi1sk: `${now}#${input.content.name}`,

    // Blueprint fields
    blueprintId,
    appId: input.content.appId,
    name: input.content.name,
    description: input.content.description,
    state: input.content.state,
    events: input.content.events,
    signature: input.signature,
    creatorAccountId: input.creatorAccountId,
    createdAt: now,
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: getTableName(),
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
  } catch (error: unknown) {
    // 如果已存在，忽略错误（去重）
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      // Blueprint 已存在，返回 ID
      return blueprintId;
    }
    throw error;
  }

  return blueprintId;
}

/**
 * 获取或创建 Blueprint
 *
 * 先检查是否存在，如果存在则复用，否则创建新的
 */
export async function getOrCreateBlueprint(input: CreateBlueprintInput): Promise<{
  blueprint: Blueprint;
  isNew: boolean;
}> {
  const blueprintId = await computeBlueprintId(input.content);

  // 尝试获取现有 Blueprint
  const existing = await getBlueprintById(blueprintId);
  if (existing) {
    return { blueprint: existing, isNew: false };
  }

  // 创建新 Blueprint
  await createBlueprintIfNotExists(input);
  const created = await getBlueprintById(blueprintId);

  if (!created) {
    throw new Error('Failed to create blueprint');
  }

  return { blueprint: created, isNew: true };
}

/**
 * 按 App 查询 Blueprints
 */
export async function getBlueprintsByApp(
  appId: string,
  options?: {
    limit?: number;
    cursor?: string;
  }
): Promise<{
  blueprints: Blueprint[];
  nextCursor?: string;
}> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'gsi1-multipurpose-index',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: {
        ':pk': Keys.appGsi1pk(appId),
      },
      Limit: options?.limit || 100,
      ExclusiveStartKey: options?.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64url').toString())
        : undefined,
      ScanIndexForward: false, // 最新的在前
    })
  );

  const blueprints = (result.Items || [])
    .filter((item) => (item.pk as string).startsWith('BLUEPRINT#'))
    .map((item) => itemToBlueprint(item as BlueprintItem));

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
    : undefined;

  return { blueprints, nextCursor };
}

