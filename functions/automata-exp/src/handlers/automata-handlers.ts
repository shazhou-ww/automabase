import { PutCommand, GetCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import jsonata from 'jsonata';
import { ulid } from 'ulid';
import { verifyAuth, isAuthError, getAutomataWithAuth, isErrorResponse } from '../middleware/auth-middleware';
import { verifyDescriptorSignature, computeDescriptorHash, type DescriptorSignatureResult } from '@automabase/automata-auth';
import {
  docClient,
  TABLE_NAME,
  META_SK,
  VERSION_ZERO,
  TENANT_USER_INDEX,
  MAX_BATCH_SIZE,
  getTenantConfig
} from '../utils/database';
import { versionIncrement, versionDecrement } from '../utils/version-utils';
import { success, error } from '../utils/response-helpers';
import type { AutomataMeta, EventRecord, BacktraceReplayResult, AutomataDescriptor } from '../types/automata-types';

/**
 * Create a new automata
 * POST /automata
 * 
 * Authorization Requirements:
 * 1. Valid JWT token (tenant & user authorization)
 * 2. Descriptor signature from tenant (prevents unauthorized automata creation)
 * 
 * Body: {
 *   stateSchema: object,
 *   eventSchemas: object,
 *   initialState: any,
 *   transition: string,
 *   name: string,
 *   descriptorSignature: string  // JWT signature of descriptor from tenant
 * }
 */
export async function createAutomata(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT - validates tenant & user authorization
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  if (!event.body) {
    return error('Request body is required');
  }

  let body: {
    stateSchema?: unknown;
    eventSchemas?: Record<string, unknown>;
    initialState?: unknown;
    transition?: string;
    name?: string;
    descriptorSignature?: string;
  };
  try {
    body = JSON.parse(event.body);
  } catch {
    return error('Invalid JSON body');
  }

  if (!body.stateSchema) {
    return error('stateSchema is required');
  }
  if (!body.eventSchemas) {
    return error('eventSchemas is required');
  }
  if (body.initialState === undefined) {
    return error('initialState is required');
  }
  if (!body.transition) {
    return error('transition is required');
  }
  if (!body.name) {
    return error('name is required');
  }
  if (!body.descriptorSignature) {
    return error('descriptorSignature is required');
  }

  // Validate transition expression
  try {
    jsonata(body.transition);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return error(`Invalid transition expression: ${message}`);
  }

  // Create descriptor object for signature verification
  const descriptor: AutomataDescriptor = {
    stateSchema: body.stateSchema,
    eventSchemas: body.eventSchemas,
    transition: body.transition,
    initialState: body.initialState,
    name: body.name,
  };

  // Verify descriptor signature
  const signatureResult: DescriptorSignatureResult = await verifyDescriptorSignature(
    body.descriptorSignature,
    descriptor,
    getTenantConfig
  );

  if (!signatureResult.isValid) {
    return error(`Invalid descriptor signature: ${signatureResult.error}`);
  }

  // Verify that the signature is from the same tenant as the JWT token
  if (signatureResult.payload?.iss !== auth.tenantId) {
    return error('Descriptor signature tenant mismatch: signature must be from the same tenant as the JWT token');
  }

  // Compute descriptor hash for storage
  const descriptorHash = computeDescriptorHash(descriptor);

  // Extract expiration time from verified signature payload
  const signatureExpiresAt = new Date((signatureResult.payload?.exp || 0) * 1000).toISOString();

  const automataId = ulid();
  const now = new Date().toISOString();

  const item: AutomataMeta = {
    pk: automataId,
    sk: META_SK,
    userId: auth.userId,
    tenantId: auth.tenantId,
    name: body.name,
    gsi1pk: `TENANT#${auth.tenantId}#USER#${auth.userId}`,
    gsi1sk: now, // createdAt for sorting
    stateSchema: body.stateSchema,
    eventSchemas: body.eventSchemas,
    transition: body.transition,
    initialState: body.initialState,
    currentState: body.initialState,
    version: VERSION_ZERO,
    createdAt: now,
    updatedAt: now,
    descriptorSignature: body.descriptorSignature,
    descriptorHash,
    signatureExpiresAt,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(pk)',
    })
  );

  return success({ id: automataId });
}

/**
 * Get an automata's current state
 * GET /automata/{automataId}
 * 
 * Authorization: Validates tenant & user authorization (user must be the owner)
 */
export async function getAutomata(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT - validates tenant & user authorization
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  // Get automata and verify tenant & user authorization
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  return success({
    id: meta.pk,
    name: meta.name,
    stateSchema: meta.stateSchema,
    eventSchemas: meta.eventSchemas,
    transition: meta.transition,
    initialState: meta.initialState,
    currentState: meta.currentState,
    version: meta.version,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  });
}

/**
 * Delete an automata
 * DELETE /automata/{automataId}
 * 
 * Authorization: Validates tenant & user authorization (user must be the owner)
 */
export async function deleteAutomata(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT - validates tenant & user authorization
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  // Get automata and verify tenant & user authorization
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Delete all events first (query by pk=automataId, sk starts with version)
  const eventsResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': automataId,
        ':prefix': '0', // versions start with '0' (base62)
      },
    })
  );

  // Delete events in batches
  const events = eventsResult.Items || [];
  for (let i = 0; i < events.length; i += 25) {
    const batch = events.slice(i, i + 25);
    await Promise.all(
      batch.map((event) =>
        docClient.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { pk: event.pk, sk: event.sk },
          })
        )
      )
    );
  }

  // Delete metadata
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: automataId, sk: META_SK },
    })
  );

  return success();
}

/**
 * Post an event to an automata
 * POST /automata/{automataId}/events
 * 
 * Authorization: Validates tenant & user authorization (user must be the owner)
 * Body: { type: string, data: any }
 */
export async function postEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT - validates tenant & user authorization
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  if (!event.body) {
    return error('Request body is required');
  }

  let body: { type?: string; data?: unknown };
  try {
    body = JSON.parse(event.body);
  } catch {
    return error('Invalid JSON body');
  }

  if (!body.type) {
    return error('type is required');
  }

  // Get automata and verify tenant & user authorization
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Validate event type exists in schema
  if (!meta.eventSchemas[body.type]) {
    return error(`Unknown event type: ${body.type}`);
  }

  // Get current state and version
  const currentVersion = meta.version;
  const currentState = meta.currentState;

  // Evaluate transition expression
  let nextState: unknown;
  try {
    const expression = jsonata(meta.transition);
    nextState = await expression.evaluate(currentState, {
      event: { type: body.type, data: body.data },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return error(`Transition evaluation failed: ${message}`);
  }

  // Increment version
  const nextVersion = versionIncrement(currentVersion);

  // Create event record
  const eventRecord: EventRecord = {
    pk: automataId,
    sk: nextVersion,
    type: body.type,
    data: body.data,
    nextState,
    createdAt: new Date().toISOString(),
  };

  // Store event record
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: eventRecord,
    })
  );

  // Update automata metadata
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: automataId, sk: META_SK },
      UpdateExpression: 'SET currentState = :state, version = :version, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':state': nextState,
        ':version': nextVersion,
        ':updatedAt': new Date().toISOString(),
      },
    })
  );

  return success({
    version: nextVersion,
    state: nextState,
  });
}

/**
 * Get a specific event by version
 * GET /automata/{automataId}/events/{version}
 * 
 * Authorization: Validates tenant & user authorization (user must be the owner)
 */
export async function getEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT - validates tenant & user authorization
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  const version = event.pathParameters?.version;
  if (!automataId) {
    return error('automataId is required');
  }
  if (!version) {
    return error('version is required');
  }

  // Get automata and verify tenant & user authorization
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Get event record
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: automataId, sk: version },
    })
  );

  if (!result.Item) {
    return error('Event not found');
  }

  const eventRecord = result.Item as EventRecord;

  return success({
    version: eventRecord.sk,
    type: eventRecord.type,
    data: eventRecord.data,
    nextState: eventRecord.nextState,
    createdAt: eventRecord.createdAt,
  });
}

/**
 * Backtrace events from current state to a target version
 * GET /automata/{automataId}/backtrace?from={version}&limit={number}
 * 
 * Authorization: Validates tenant & user authorization (user must be the owner)
 */
export async function backtrace(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT - validates tenant & user authorization
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  const fromVersion = event.queryStringParameters?.from;
  const limitParam = event.queryStringParameters?.limit;
  const limit = Math.min(
    limitParam ? Number.parseInt(limitParam, 10) : MAX_BATCH_SIZE,
    MAX_BATCH_SIZE
  );

  // Get automata and verify tenant & user authorization
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Determine start and end versions for backtrace
  const currentVersion = meta.version;
  let startVersion = currentVersion;
  let endVersion = VERSION_ZERO;

  if (fromVersion) {
    // Validate fromVersion format
    if (!/^[0-9a-zA-Z]{6}$/.test(fromVersion)) {
      return error('Invalid from version format');
    }
    // fromVersion must be <= currentVersion
    if (fromVersion > currentVersion) {
      return error('from version cannot be greater than current version');
    }
    endVersion = versionDecrement(fromVersion);
  }

  // Query events in reverse chronological order (newest first)
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':pk': automataId,
        ':start': endVersion,
        ':end': startVersion,
      },
      ScanIndexForward: false, // Reverse order (newest first)
      Limit: limit,
    })
  );

  const events = (result.Items || []).map((item) => ({
    version: item.sk,
    type: item.type,
    data: item.data,
    nextState: item.nextState,
    createdAt: item.createdAt,
  }));

  // Determine if there's a next page
  const hasMore = events.length === limit;
  const nextAnchor = hasMore ? events[events.length - 1].version : null;

  const data: BacktraceReplayResult = {
    events,
    nextAnchor,
  };

  return success(data);
}

/**
 * Replay events from initial state to a target version
 * GET /automata/{automataId}/replay?to={version}&limit={number}
 * 
 * Authorization: Validates tenant & user authorization (user must be the owner)
 */
export async function replay(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT - validates tenant & user authorization
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  const toVersion = event.queryStringParameters?.to;
  const limitParam = event.queryStringParameters?.limit;
  const limit = Math.min(
    limitParam ? Number.parseInt(limitParam, 10) : MAX_BATCH_SIZE,
    MAX_BATCH_SIZE
  );

  // Get automata and verify tenant & user authorization
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Determine start and end versions for replay
  const initialVersion = VERSION_ZERO;
  let endVersion = meta.version;

  if (toVersion) {
    // Validate toVersion format
    if (!/^[0-9a-zA-Z]{6}$/.test(toVersion)) {
      return error('Invalid to version format');
    }
    // toVersion must be <= currentVersion and >= initialVersion
    if (toVersion > meta.version || toVersion < initialVersion) {
      return error('to version out of range');
    }
    endVersion = toVersion;
  }

  // Query events in chronological order (oldest first)
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':pk': automataId,
        ':start': initialVersion,
        ':end': endVersion,
      },
      ScanIndexForward: true, // Chronological order (oldest first)
      Limit: limit,
    })
  );

  const events = (result.Items || []).map((item) => ({
    version: item.sk,
    type: item.type,
    data: item.data,
    nextState: item.nextState,
    createdAt: item.createdAt,
  }));

  // Determine if there's a next page
  const hasMore = events.length === limit;
  const nextAnchor = hasMore ? events[events.length - 1].version : null;

  const data: BacktraceReplayResult = {
    events,
    nextAnchor,
  };

  return success(data);
}

/**
 * List automata owned by the authenticated user
 * GET /automata?limit={number}&anchor={lastCreatedAt}
 * 
 * Authorization: Validates tenant & user authorization
 * Returns only automata owned by the authenticated user in the same tenant
 */
export async function listAutomata(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT - validates tenant & user authorization
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const limitParam = event.queryStringParameters?.limit;
  const anchor = event.queryStringParameters?.anchor;
  const limit = Math.min(
    limitParam ? Number.parseInt(limitParam, 10) : MAX_BATCH_SIZE,
    MAX_BATCH_SIZE
  );

  if (Number.isNaN(limit) || limit < 1) {
    return error('Invalid limit parameter');
  }

  // Build GSI query
  const queryParams: any = {
    TableName: TABLE_NAME,
    IndexName: TENANT_USER_INDEX,
    KeyConditionExpression: 'gsi1pk = :gsi1pk',
    ExpressionAttributeValues: {
      ':gsi1pk': `TENANT#${auth.tenantId}#USER#${auth.userId}`,
    },
    ScanIndexForward: false, // Newest first
    Limit: limit + 1, // +1 to detect if there are more
  };

  // Add pagination if anchor provided
  if (anchor) {
    queryParams.KeyConditionExpression += ' AND gsi1sk < :anchor';
    queryParams.ExpressionAttributeValues[':anchor'] = anchor;
  }

  const result = await docClient.send(new QueryCommand(queryParams));
  const items = result.Items || [];

  // Determine if there's a next page
  const hasMore = items.length > limit;
  const automatasToReturn = hasMore ? items.slice(0, limit) : items;
  const nextAnchor = hasMore ? automatasToReturn[automatasToReturn.length - 1].gsi1sk : null;

  const data = {
    automatas: automatasToReturn.map((item) => ({
      id: item.pk,
      name: item.name,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    nextAnchor,
  };

  return success(data);
}