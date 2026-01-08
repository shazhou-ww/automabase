/**
 * Automata Repository - DynamoDB operations for Automata entity
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  type GetCommandInput,
  type PutCommandInput,
  type UpdateCommandInput,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { ulid } from 'ulid';

import type {
  Automata,
  AutomataDescriptor,
  AutomataListItem,
  CreateAutomataRequest,
} from '../types/automata';
import { getDocClient } from './client';
import { TABLE_NAME, META_SK, GSI, DEFAULT_PAGE_SIZE, VERSION_ZERO } from './constants';
import { automataKeys, automataPK, gsi1PK, gsi1SK, gsi2PK, gsi2SK } from './keys';

/**
 * DynamoDB item structure for Automata
 */
interface AutomataItem {
  pk: string;
  sk: string;
  automataId: string;
  tenantId: string;
  realmId: string;
  descriptor: AutomataDescriptor;
  descriptorSignature: string;
  descriptorHash: string;
  creatorSubjectId: string;
  currentState: unknown;
  version: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  // GSI keys
  gsi1pk: string;
  gsi1sk: string;
  gsi2pk: string;
  gsi2sk: string;
}

/**
 * Convert DynamoDB item to Automata entity
 */
function itemToAutomata(item: AutomataItem): Automata {
  return {
    automataId: item.automataId,
    tenantId: item.tenantId,
    realmId: item.realmId,
    descriptor: item.descriptor,
    descriptorSignature: item.descriptorSignature,
    descriptorHash: item.descriptorHash,
    creatorSubjectId: item.creatorSubjectId,
    currentState: item.currentState,
    version: item.version,
    status: item.status as Automata['status'],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Convert Automata to list item
 */
function automataToListItem(automata: Automata): AutomataListItem {
  return {
    automataId: automata.automataId,
    name: automata.descriptor.name,
    version: automata.version,
    status: automata.status,
    createdAt: automata.createdAt,
    updatedAt: automata.updatedAt,
  };
}

/**
 * Get an automata by ID
 */
export async function getAutomata(automataId: string): Promise<Automata | null> {
  const docClient = getDocClient();

  const params: GetCommandInput = {
    TableName: TABLE_NAME,
    Key: automataKeys(automataId),
  };

  const result = await docClient.send(new GetCommand(params));

  if (!result.Item) {
    return null;
  }

  return itemToAutomata(result.Item as AutomataItem);
}

/**
 * Create a new automata
 */
export async function createAutomata(
  tenantId: string,
  realmId: string,
  creatorSubjectId: string,
  request: CreateAutomataRequest,
  descriptorHash: string
): Promise<Automata> {
  const docClient = getDocClient();
  const now = new Date().toISOString();
  const automataId = ulid();

  const item: AutomataItem = {
    pk: automataPK(automataId),
    sk: META_SK,
    automataId,
    tenantId,
    realmId,
    descriptor: request.descriptor,
    descriptorSignature: request.descriptorSignature,
    descriptorHash,
    creatorSubjectId,
    currentState: request.descriptor.initialState,
    version: VERSION_ZERO,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    // GSI keys
    gsi1pk: gsi1PK(tenantId, realmId),
    gsi1sk: gsi1SK(now, automataId),
    gsi2pk: gsi2PK(creatorSubjectId),
    gsi2sk: gsi2SK(now, automataId),
  };

  const params: PutCommandInput = {
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: 'attribute_not_exists(pk)',
  };

  await docClient.send(new PutCommand(params));

  return itemToAutomata(item);
}

/**
 * List automatas in a realm
 */
export async function listAutomatasInRealm(
  tenantId: string,
  realmId: string,
  options?: {
    limit?: number;
    cursor?: string;
  }
): Promise<{ automatas: AutomataListItem[]; nextCursor?: string }> {
  const docClient = getDocClient();
  const limit = options?.limit ?? DEFAULT_PAGE_SIZE;

  const params: QueryCommandInput = {
    TableName: TABLE_NAME,
    IndexName: GSI.TENANT_REALM,
    KeyConditionExpression: 'gsi1pk = :pk',
    ExpressionAttributeValues: {
      ':pk': gsi1PK(tenantId, realmId),
    },
    Limit: limit,
    ScanIndexForward: false, // newest first
  };

  if (options?.cursor) {
    params.ExclusiveStartKey = JSON.parse(
      Buffer.from(options.cursor, 'base64').toString('utf-8')
    );
  }

  const result = await docClient.send(new QueryCommand(params));

  const automatas: AutomataListItem[] = (result.Items ?? []).map((item) =>
    automataToListItem(itemToAutomata(item as AutomataItem))
  );

  let nextCursor: string | undefined;
  if (result.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return { automatas, nextCursor };
}

/**
 * Update automata state after event processing
 */
export async function updateAutomataState(
  automataId: string,
  expectedVersion: string,
  newState: unknown,
  newVersion: string
): Promise<boolean> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  const params: UpdateCommandInput = {
    TableName: TABLE_NAME,
    Key: automataKeys(automataId),
    UpdateExpression: 'SET #currentState = :newState, #version = :newVersion, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#currentState': 'currentState',
      '#version': 'version',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':newState': newState,
      ':newVersion': newVersion,
      ':updatedAt': now,
      ':expectedVersion': expectedVersion,
    },
    ConditionExpression: 'attribute_exists(pk) AND #version = :expectedVersion',
  };

  try {
    await docClient.send(new UpdateCommand(params));
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return false; // Version conflict or automata not found
    }
    throw error;
  }
}

/**
 * Archive an automata
 */
export async function archiveAutomata(automataId: string): Promise<{ updatedAt: string } | null> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  const params: UpdateCommandInput = {
    TableName: TABLE_NAME,
    Key: automataKeys(automataId),
    UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':status': 'archived',
      ':updatedAt': now,
    },
    ConditionExpression: 'attribute_exists(pk)',
  };

  try {
    await docClient.send(new UpdateCommand(params));
    return { updatedAt: now };
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return null;
    }
    throw error;
  }
}

/**
 * Generate a new automata ID (ULID)
 */
export function generateAutomataId(): string {
  return ulid();
}
