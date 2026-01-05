import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ulid } from 'ulid';

// Constants
const TABLE_NAME = process.env.EVENT_STREAM_TABLE || 'event-stream';
const META_SK = '#META';
const SAFETY_WINDOW_MS = 3; // Safety window to prevent ULID time precision issues
const MAX_BATCH_SIZE = 100; // Maximum events per query

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

// Interfaces
interface StreamMeta {
  pk: string;
  sk: typeof META_SK;
  schema: unknown;
  createdAt: string;
}

interface EventRecord {
  pk: string;
  sk: string;
  body: unknown;
  createdAt: string;
}

interface BacktraceReplayResult {
  events: Array<{ eventId: string; body: unknown; createdAt: string }>;
  nextAnchor: string | null;
}

// Route handlers

/**
 * Create a new stream with the given schema
 * POST /streams
 * Body: { schema: object }
 */
async function createStream(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return error('Request body is required');
  }

  let body: { schema?: unknown };
  try {
    body = JSON.parse(event.body);
  } catch {
    return error('Invalid JSON body');
  }

  if (!body.schema) {
    return error('schema is required');
  }

  const streamId = ulid();
  const now = new Date().toISOString();

  const item: StreamMeta = {
    pk: streamId,
    sk: META_SK,
    schema: body.schema,
    createdAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(pk)',
    })
  );

  return success(streamId);
}

/**
 * Delete a stream and all its events
 * DELETE /streams/{streamId}
 */
async function deleteStream(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const streamId = event.pathParameters?.streamId;
  if (!streamId) {
    return error('streamId is required');
  }

  // Check if stream exists
  const streamResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: streamId, sk: META_SK },
    })
  );

  if (!streamResult.Item) {
    return error('Stream not found');
  }

  // Query all items for this stream and delete them
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': streamId },
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
 * Push an event to a stream
 * POST /streams/{streamId}/events
 * Body: { body: object }
 */
async function pushEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const streamId = event.pathParameters?.streamId;
  if (!streamId) {
    return error('streamId is required');
  }

  if (!event.body) {
    return error('Request body is required');
  }

  let requestBody: { body?: unknown };
  try {
    requestBody = JSON.parse(event.body);
  } catch {
    return error('Invalid JSON body');
  }

  if (requestBody.body === undefined) {
    return error('body is required');
  }

  // Check if stream exists
  const streamResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: streamId, sk: META_SK },
    })
  );

  if (!streamResult.Item) {
    return error('Stream not found');
  }

  const eventId = ulid();
  const now = new Date().toISOString();

  const item: EventRecord = {
    pk: streamId,
    sk: eventId,
    body: requestBody.body,
    createdAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return success(eventId);
}

/**
 * Get a specific event
 * GET /streams/{streamId}/events/{eventId}
 */
async function getEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const streamId = event.pathParameters?.streamId;
  const eventId = event.pathParameters?.eventId;

  if (!streamId) {
    return error('streamId is required');
  }
  if (!eventId) {
    return error('eventId is required');
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: streamId, sk: eventId },
    })
  );

  if (!result.Item || result.Item.sk === META_SK) {
    return error('Event not found');
  }

  const eventRecord = result.Item as EventRecord;
  return success(eventRecord.body);
}

/**
 * Generate a ULID for a specific timestamp
 */
function ulidFromTime(timestamp: number): string {
  // ULID encoding characters
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // Encode timestamp (first 10 characters)
  let timeStr = '';
  let t = timestamp;
  for (let i = 0; i < 10; i++) {
    timeStr = ENCODING[t % 32] + timeStr;
    t = Math.floor(t / 32);
  }

  return timeStr;
}

/**
 * Backtrace events from a stream (newest to oldest)
 * GET /streams/{streamId}/backtrace?anchor={eventId}&limit={number}
 */
async function backtrace(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const streamId = event.pathParameters?.streamId;
  if (!streamId) {
    return error('streamId is required');
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

  // Check if stream exists
  const streamResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: streamId, sk: META_SK },
    })
  );

  if (!streamResult.Item) {
    return error('Stream not found');
  }

  // Determine the starting point
  let endKey: string;
  if (anchor) {
    endKey = anchor;
  } else {
    // Use current time minus safety window to get "latest" events
    const safeTimestamp = Date.now() - SAFETY_WINDOW_MS;
    // Generate a ULID prefix for this timestamp (max possible)
    endKey = `${ulidFromTime(safeTimestamp)}ZZZZZZZZZZZZZZZZ`;
  }

  // Query events in descending order (newest first)
  // Use sk BETWEEN '0' AND endKey to exclude #META (since '0' > '#' in ASCII)
  // ULID always starts with '0' so this catches all event IDs
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':pk': streamId,
        ':start': '0', // ULID starts with '0', '#META' is excluded
        ':end': endKey,
      },
      ScanIndexForward: false, // Descending order
      Limit: limit + 2, // Fetch extra to account for anchor exclusion and pagination check
    })
  );

  // Filter out the anchor itself (BETWEEN is inclusive, we want exclusive)
  const items = ((result.Items || []) as EventRecord[]).filter(
    (item) => !anchor || item.sk !== anchor
  );

  // Determine if there's a next page
  const hasMore = items.length > limit;
  const eventsToReturn = hasMore ? items.slice(0, limit) : items;
  const nextAnchor = hasMore ? eventsToReturn[eventsToReturn.length - 1].sk : null;

  const data: BacktraceReplayResult = {
    events: eventsToReturn.map((item) => ({
      eventId: item.sk,
      body: item.body,
      createdAt: item.createdAt,
    })),
    nextAnchor,
  };

  return success(data);
}

/**
 * Replay events from a stream (oldest to newest)
 * GET /streams/{streamId}/replay?anchor={eventId}&limit={number}
 */
async function replay(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const streamId = event.pathParameters?.streamId;
  if (!streamId) {
    return error('streamId is required');
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

  // Check if stream exists
  const streamResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: streamId, sk: META_SK },
    })
  );

  if (!streamResult.Item) {
    return error('Stream not found');
  }

  // Build query based on anchor
  // Use sk > anchor (or sk > '#META' when no anchor) to get events in order
  // Since '#' < '0' in ASCII, sk > '#META' will get all ULID-based event IDs
  const startKey = anchor || META_SK;

  // Query events in ascending order (oldest first)
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk > :sk',
      ExpressionAttributeValues: {
        ':pk': streamId,
        ':sk': startKey,
      },
      ScanIndexForward: true, // Ascending order
      Limit: limit + 1, // Fetch one extra to check if there's a next page
    })
  );

  const items = (result.Items || []) as EventRecord[];

  // Determine if there's a next page
  const hasMore = items.length > limit;
  const eventsToReturn = hasMore ? items.slice(0, limit) : items;
  const nextAnchor = hasMore ? eventsToReturn[eventsToReturn.length - 1].sk : null;

  const data: BacktraceReplayResult = {
    events: eventsToReturn.map((item) => ({
      eventId: item.sk,
      body: item.body,
      createdAt: item.createdAt,
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

    // Route based on method and path
    if (method === 'POST' && path === '/streams') {
      return await createStream(event);
    }

    if (method === 'DELETE' && path === '/streams/{streamId}') {
      return await deleteStream(event);
    }

    if (method === 'POST' && path === '/streams/{streamId}/events') {
      return await pushEvent(event);
    }

    if (method === 'GET' && path === '/streams/{streamId}/events/{eventId}') {
      return await getEvent(event);
    }

    if (method === 'GET' && path === '/streams/{streamId}/backtrace') {
      return await backtrace(event);
    }

    if (method === 'GET' && path === '/streams/{streamId}/replay') {
      return await replay(event);
    }

    return error(`Unknown route: ${method} ${path}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Handler error:', err);
    return error(message);
  }
};
