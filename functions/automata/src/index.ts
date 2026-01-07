import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import jsonata from 'jsonata';
import { ulid } from 'ulid'; // Still used for automataId
import {
  type TenantConfig,
  type VerifiedToken,
  verifyJwtWithTenantConfig,
  extractBearerToken,
  AuthError,
} from '@automabase/automata-auth';

// Constants
const TABLE_NAME = process.env.AUTOMATA_TABLE || 'automata';
const TENANT_CONFIG_TABLE = process.env.TENANT_CONFIG_TABLE || 'tenant-config';
const META_SK = '#META';
const CONFIG_SK = '#CONFIG';
const MAX_BATCH_SIZE = 100; // Maximum events per query
const VERSION_ZERO = '000000'; // Initial version (6-digit base62, ~568 billion max)
const TENANT_USER_INDEX = 'tenant-user-index'; // GSI for listing automata by tenant+user

// Tenant ID claim name from environment
const TENANT_ID_CLAIM = process.env.TENANT_ID_CLAIM || 'tenant_id';

// Tenant config cache (in-memory, per Lambda instance)
const tenantConfigCache = new Map<string, { config: TenantConfig; expiresAt: number }>();
const TENANT_CONFIG_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Base62 charset (sortable: 0-9A-Za-z)
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Increment a base62 version string by 1
 * "000000" → "000001", "00000z" → "000010"
 */
function versionIncrement(v: string): string {
  const chars = v.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = BASE62.indexOf(chars[i]);
    if (idx < 61) {
      chars[i] = BASE62[idx + 1];
      return chars.join('');
    }
    chars[i] = '0'; // carry
  }
  throw new Error('Version overflow');
}

/**
 * Decrement a base62 version string by 1
 * "000001" → "000000", "000010" → "00000z"
 */
function versionDecrement(v: string): string {
  const chars = v.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = BASE62.indexOf(chars[i]);
    if (idx > 0) {
      chars[i] = BASE62[idx - 1];
      return chars.join('');
    }
    chars[i] = 'z'; // borrow
  }
  throw new Error('Version underflow');
}

// DynamoDB client - use local endpoint for SAM Local
const isLocal = process.env.AWS_SAM_LOCAL === 'true';
const dynamoClient = new DynamoDBClient(
  isLocal ? { endpoint: 'http://host.docker.internal:8000' } : {}
);
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Response helpers
const success = (data?: unknown): APIGatewayProxyResult => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: true, ...(data !== undefined && { data }) }),
});

const error = (message: string): APIGatewayProxyResult => ({
  statusCode: 400,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: false, error: message }),
});

// Response helpers for auth errors
const unauthorized = (message: string): APIGatewayProxyResult => ({
  statusCode: 401,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: false, error: message }),
});

const forbidden = (message: string): APIGatewayProxyResult => ({
  statusCode: 403,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: false, error: message }),
});

/**
 * Get tenant configuration from DynamoDB with caching
 */
async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  // Check cache first
  const cached = tenantConfigCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  // Fetch from DynamoDB
  const result = await docClient.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: tenantId, sk: CONFIG_SK },
    })
  );

  if (!result.Item) {
    return null;
  }

  const config: TenantConfig = {
    tenantId: result.Item.pk,
    jwksUri: result.Item.jwksUri,
    issuer: result.Item.issuer,
    audience: result.Item.audience,
    createdAt: result.Item.createdAt,
    updatedAt: result.Item.updatedAt,
  };

  // Cache the result
  tenantConfigCache.set(tenantId, {
    config,
    expiresAt: Date.now() + TENANT_CONFIG_CACHE_DURATION,
  });

  return config;
}

/**
 * Verify JWT from Authorization header using dynamic tenant config
 */
async function verifyAuth(event: APIGatewayProxyEvent): Promise<VerifiedToken | APIGatewayProxyResult> {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    return unauthorized('Missing or invalid Authorization header');
  }

  try {
    return await verifyJwtWithTenantConfig(token, getTenantConfig, TENANT_ID_CLAIM);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return unauthorized(err.message);
    }
    return unauthorized('Token verification failed');
  }
}

/**
 * Check if auth result is an error response
 */
function isAuthError(result: VerifiedToken | APIGatewayProxyResult): result is APIGatewayProxyResult {
  return 'statusCode' in result;
}

/**
 * Verify that the user owns the automata and belongs to the same tenant
 */
function verifyOwnership(
  meta: AutomataMeta,
  auth: VerifiedToken
): APIGatewayProxyResult | null {
  if (meta.tenantId !== auth.tenantId) {
    return forbidden('Access denied: tenant mismatch');
  }
  if (meta.userId !== auth.userId) {
    return forbidden('Access denied: not the owner');
  }
  return null; // No error, ownership verified
}

/**
 * Helper to get automata and verify ownership
 */
async function getAutomataWithAuth(
  automataId: string,
  auth: VerifiedToken
): Promise<AutomataMeta | APIGatewayProxyResult> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: automataId, sk: META_SK },
    })
  );

  if (!result.Item) {
    return error('Automata not found');
  }

  const meta = result.Item as AutomataMeta;
  const ownershipError = verifyOwnership(meta, auth);
  if (ownershipError) {
    return ownershipError;
  }

  return meta;
}

/**
 * Check if result is an error response
 */
function isErrorResponse(result: AutomataMeta | APIGatewayProxyResult): result is APIGatewayProxyResult {
  return 'statusCode' in result;
}

// Interfaces
interface AutomataMeta {
  pk: string;
  sk: typeof META_SK;
  userId: string; // Owner of the automata
  tenantId: string; // Tenant ID
  name?: string; // Optional name
  gsi1pk: string; // "TENANT#tenantId#USER#userId" for tenant-user-index
  gsi1sk: string; // createdAt for sorting
  stateSchema: unknown; // JSONSchema for state validation
  eventSchemas: Record<string, unknown>; // event type -> JSONSchema
  transition: string; // JSONata expression
  initialState: unknown; // Initial state (immutable, version "000000")
  currentState: unknown; // Current state of the automata
  version: string; // Current version (base62, e.g., "000000")
  createdAt: string;
  updatedAt: string;
}

interface EventRecord {
  pk: string;
  sk: string; // version (base62, e.g., "000001")
  type: string; // event type
  data: unknown; // event data
  nextState: unknown; // state after this event
  createdAt: string;
}

interface BacktraceReplayResult {
  events: Array<{
    version: string;
    type: string;
    data: unknown;
    nextState: unknown;
    createdAt: string;
  }>;
  nextAnchor: string | null;
}

// Route handlers

/**
 * Create a new automata
 * POST /automata
 * Body: { stateSchema: object, eventSchemas: object, initialState: any, transition: string, name?: string }
 */
async function createAutomata(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT
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

  // Validate transition expression
  try {
    jsonata(body.transition);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return error(`Invalid transition expression: ${message}`);
  }

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
 */
async function getAutomata(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  // Get automata and verify ownership
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  return success({
    id: automataId,
    name: meta.name,
    userId: meta.userId,
    tenantId: meta.tenantId,
    version: meta.version,
    state: meta.currentState,
    initialState: meta.initialState,
    stateSchema: meta.stateSchema,
    eventSchemas: meta.eventSchemas,
    transition: meta.transition,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  });
}

/**
 * Delete an automata and all its events
 * DELETE /automata/{automataId}
 */
async function deleteAutomata(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  // Get automata and verify ownership
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Query all items for this automata and delete them
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': automataId },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    // Delete each item
    for (const item of queryResult.Items || []) {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { pk: item.pk, sk: item.sk },
        })
      );
    }

    lastEvaluatedKey = queryResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return success();
}

/**
 * Post an event to an automata (state transition)
 * POST /automata/{automataId}/events
 * Body: { type: string, data: any }
 */
async function postEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT
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

  let requestBody: { type?: string; data?: unknown };
  try {
    requestBody = JSON.parse(event.body);
  } catch {
    return error('Invalid JSON body');
  }

  if (!requestBody.type) {
    return error('type is required');
  }

  // Get automata and verify ownership
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Check if event type is valid
  if (!meta.eventSchemas[requestBody.type]) {
    return error(`Unknown event type: ${requestBody.type}`);
  }

  // Execute transition
  let nextState: unknown;

  try {
    const expression = jsonata(meta.transition);
    // Provide context: { state, event: { type, data } }
    nextState = await expression.evaluate({
      state: meta.currentState,
      event: {
        type: requestBody.type,
        data: requestBody.data,
      },
    });
  } catch (err) {
    console.error('Transition error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return error(`Transition error: ${message}`);
  }

  const nextVersion = versionIncrement(meta.version);
  const now = new Date().toISOString();

  // Create event record (only store nextState, prevState can be derived)
  const eventRecord: EventRecord = {
    pk: automataId,
    sk: nextVersion,
    type: requestBody.type,
    data: requestBody.data,
    nextState,
    createdAt: now,
  };

  // Create event record with condition to prevent duplicate versions
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: eventRecord,
      ConditionExpression: 'attribute_not_exists(pk)',
    })
  );

  // Update the automata's current state and version atomically
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: automataId, sk: META_SK },
      UpdateExpression: 'SET currentState = :state, version = :version, updatedAt = :now',
      ConditionExpression: 'version = :prevVersion',
      ExpressionAttributeValues: {
        ':state': nextState,
        ':version': nextVersion,
        ':prevVersion': meta.version,
        ':now': now,
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
 */
async function getEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT
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

  // Verify ownership first
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: automataId, sk: version },
    })
  );

  if (!result.Item || result.Item.sk === META_SK) {
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
 * Backtrace events from an automata (newest to oldest)
 * GET /automata/{automataId}/backtrace?anchor={version}&limit={number}
 */
async function backtrace(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  const anchor = event.queryStringParameters?.anchor;
  const limitParam = event.queryStringParameters?.limit;
  const limit = Math.min(
    limitParam ? Number.parseInt(limitParam, 10) : MAX_BATCH_SIZE,
    MAX_BATCH_SIZE
  );

  if (Number.isNaN(limit) || limit < 1) {
    return error('Invalid limit parameter');
  }

  // Get automata and verify ownership
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Determine the starting point (use anchor or current version)
  const endKey = anchor || meta.version;

  // No events if at version 0
  if (endKey === VERSION_ZERO) {
    return success({ events: [], nextAnchor: null });
  }

  // Query events in descending order (newest first)
  // sk BETWEEN "000001" AND endKey to get events <= endKey
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':pk': automataId,
        ':start': versionIncrement(VERSION_ZERO), // "000001"
        ':end': endKey,
      },
      ScanIndexForward: false, // Descending order
      Limit: limit + 1, // Fetch extra for pagination check
    })
  );

  const items = (result.Items || []) as EventRecord[];

  // Determine if there's a next page
  const hasMore = items.length > limit;
  const eventsToReturn = hasMore ? items.slice(0, limit) : items;
  const nextAnchor = hasMore ? versionDecrement(eventsToReturn[eventsToReturn.length - 1].sk) : null;

  const data: BacktraceReplayResult = {
    events: eventsToReturn.map((item) => ({
      version: item.sk,
      type: item.type,
      data: item.data,
      nextState: item.nextState,
      createdAt: item.createdAt,
    })),
    nextAnchor,
  };

  return success(data);
}

/**
 * Replay events from an automata (oldest to newest)
 * GET /automata/{automataId}/replay?anchor={version}&limit={number}
 */
async function replay(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const automataId = event.pathParameters?.automataId;
  if (!automataId) {
    return error('automataId is required');
  }

  const anchor = event.queryStringParameters?.anchor;
  const limitParam = event.queryStringParameters?.limit;
  const limit = Math.min(
    limitParam ? Number.parseInt(limitParam, 10) : MAX_BATCH_SIZE,
    MAX_BATCH_SIZE
  );

  if (Number.isNaN(limit) || limit < 1) {
    return error('Invalid limit parameter');
  }

  // Get automata and verify ownership
  const meta = await getAutomataWithAuth(automataId, auth);
  if (isErrorResponse(meta)) {
    return meta;
  }

  // Start from anchor (exclusive) or from version "000001"
  const startKey = anchor || VERSION_ZERO;

  // Query events in ascending order (oldest first)
  // sk > startKey gets events after the anchor
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk > :sk',
      ExpressionAttributeValues: {
        ':pk': automataId,
        ':sk': startKey,
      },
      ScanIndexForward: true, // Ascending order
      Limit: limit + 1, // Fetch one extra to check if there's a next page
    })
  );

  // Filter out META record if it somehow appears
  const items = ((result.Items || []) as EventRecord[]).filter(
    (item) => item.sk !== META_SK
  );

  // Determine if there's a next page
  const hasMore = items.length > limit;
  const eventsToReturn = hasMore ? items.slice(0, limit) : items;
  const nextAnchor = hasMore ? eventsToReturn[eventsToReturn.length - 1].sk : null;

  const data: BacktraceReplayResult = {
    events: eventsToReturn.map((item) => ({
      version: item.sk,
      type: item.type,
      data: item.data,
      nextState: item.nextState,
      createdAt: item.createdAt,
    })),
    nextAnchor,
  };

  return success(data);
}

/**
 * List result for automata
 */
interface ListAutomataResult {
  automatas: Array<{
    id: string;
    name?: string;
    version: string;
    createdAt: string;
    updatedAt: string;
  }>;
  nextAnchor: string | null;
}

/**
 * List all automata for the current user in the current tenant
 * GET /automata?limit={number}&anchor={createdAt}
 */
async function listAutomata(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Verify JWT
  const auth = await verifyAuth(event);
  if (isAuthError(auth)) {
    return auth;
  }

  const anchor = event.queryStringParameters?.anchor;
  const limitParam = event.queryStringParameters?.limit;
  const limit = Math.min(
    limitParam ? Number.parseInt(limitParam, 10) : MAX_BATCH_SIZE,
    MAX_BATCH_SIZE
  );

  if (Number.isNaN(limit) || limit < 1) {
    return error('Invalid limit parameter');
  }

  // Build GSI key for tenant+user
  const gsi1pk = `TENANT#${auth.tenantId}#USER#${auth.userId}`;

  // Query using GSI, sorted by createdAt (gsi1sk) in descending order (newest first)
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: TENANT_USER_INDEX,
      KeyConditionExpression: anchor
        ? 'gsi1pk = :pk AND gsi1sk < :anchor'
        : 'gsi1pk = :pk',
      ExpressionAttributeValues: anchor
        ? { ':pk': gsi1pk, ':anchor': anchor }
        : { ':pk': gsi1pk },
      ScanIndexForward: false, // Descending order (newest first)
      Limit: limit + 1, // Fetch one extra to check if there's a next page
    })
  );

  const items = (result.Items || []) as AutomataMeta[];

  // Determine if there's a next page
  const hasMore = items.length > limit;
  const automatasToReturn = hasMore ? items.slice(0, limit) : items;
  const nextAnchor = hasMore ? automatasToReturn[automatasToReturn.length - 1].gsi1sk : null;

  const data: ListAutomataResult = {
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

/**
 * Main handler - routes requests to appropriate handlers
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method = event.httpMethod;
    const path = event.resource;

    // Automata routes (JWT auth required)
    if (method === 'GET' && path === '/automata') {
      return await listAutomata(event);
    }

    if (method === 'POST' && path === '/automata') {
      return await createAutomata(event);
    }

    if (method === 'GET' && path === '/automata/{automataId}') {
      return await getAutomata(event);
    }

    if (method === 'DELETE' && path === '/automata/{automataId}') {
      return await deleteAutomata(event);
    }

    if (method === 'POST' && path === '/automata/{automataId}/events') {
      return await postEvent(event);
    }

    if (method === 'GET' && path === '/automata/{automataId}/events/{version}') {
      return await getEvent(event);
    }

    if (method === 'GET' && path === '/automata/{automataId}/backtrace') {
      return await backtrace(event);
    }

    if (method === 'GET' && path === '/automata/{automataId}/replay') {
      return await replay(event);
    }

    return error(`Unknown route: ${method} ${path}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Handler error:', err);
    return error(message);
  }
};
