import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import {
  type TenantConfig,
  type VerifiedToken,
  verifyJwtWithTenantConfig,
  AuthError,
} from '@automabase/automata-auth';

// Constants
const AUTOMATA_TABLE = process.env.AUTOMATA_TABLE || 'automata';
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'automata-connections';
const TENANT_CONFIG_TABLE = process.env.TENANT_CONFIG_TABLE || 'tenant-config';
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT || '';
const META_SK = '#META';
const CONFIG_SK = '#CONFIG';

// Tenant ID claim name from environment
const TENANT_ID_CLAIM = process.env.TENANT_ID_CLAIM || 'tenant_id';

// Tenant config cache (in-memory, per Lambda instance)
const tenantConfigCache = new Map<string, { config: TenantConfig; expiresAt: number }>();
const TENANT_CONFIG_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// DynamoDB client
const isLocal = process.env.AWS_SAM_LOCAL === 'true';
const dynamoClient = new DynamoDBClient(
  isLocal ? { endpoint: 'http://host.docker.internal:8000' } : {}
);
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

// Connection record structure
// pk: automataId, sk: connectionId
// GSI: connectionId-index (pk: connectionId) for cleanup on disconnect
interface ConnectionRecord {
  pk: string; // automataId
  sk: string; // connectionId
  subscribedAt: string;
}

// Automata metadata (for ownership check)
interface AutomataMeta {
  pk: string;
  userId: string;
  tenantId: string;
  currentState: unknown;
  version: string;
  updatedAt: string;
}

// Message types sent to clients
interface StateUpdateMessage {
  type: 'state';
  automataId: string;
  event: {
    type: string;
    data: unknown;
  };
  state: unknown;
  version: string;
  timestamp: string;
}

interface SubscribedMessage {
  type: 'subscribed';
  automataId: string;
  state: unknown;
  version: string;
  timestamp: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

/**
 * Get API Gateway Management API client
 */
function getApiGatewayClient(): ApiGatewayManagementApiClient {
  const endpoint = isLocal
    ? 'http://localhost:3001' // SAM local WebSocket endpoint
    : WEBSOCKET_ENDPOINT;

  return new ApiGatewayManagementApiClient({ endpoint });
}

/**
 * Send message to a WebSocket connection
 */
async function sendToConnection(
  connectionId: string,
  message: StateUpdateMessage | SubscribedMessage | ErrorMessage
): Promise<boolean> {
  const client = getApiGatewayClient();

  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      })
    );
    return true;
  } catch (err) {
    if (err instanceof GoneException) {
      // Connection is gone, clean it up
      console.log(`Connection ${connectionId} is gone, will be cleaned up`);
      return false;
    }
    console.error(`Failed to send to connection ${connectionId}:`, err);
    return false;
  }
}


/**
 * Handle $connect route
 * Expects JWT token in query string: ?token=xxx
 * Only validates the token format/signature, does not store auth info.
 * Auth is verified again on each subscribe action.
 */
async function handleConnect(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  console.log(`New connection: ${connectionId}`);

  // Get token from query string (available in $connect event via requestContext)
  const queryParams = (event as unknown as { queryStringParameters?: Record<string, string> }).queryStringParameters;
  const token = queryParams?.token;
  if (!token) {
    console.log(`Connection ${connectionId} rejected: missing token`);
    return { statusCode: 401, body: 'Missing token' };
  }

  // Verify JWT format and signature using dynamic tenant config
  try {
    await verifyJwtWithTenantConfig(token, getTenantConfig, TENANT_ID_CLAIM);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      console.log(`Connection ${connectionId} rejected: ${err.message}`);
      return { statusCode: 401, body: err.message };
    }
    console.log(`Connection ${connectionId} rejected: token verification failed`);
    return { statusCode: 401, body: 'Token verification failed' };
  }

  console.log(`Connection ${connectionId} authenticated`);
  return { statusCode: 200, body: 'Connected' };
}

/**
 * Handle $disconnect route
 * Only cleans up subscription records, no auth records to clean.
 */
async function handleDisconnect(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  console.log(`Disconnecting: ${connectionId}`);

  // Query all subscriptions for this connection using GSI
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: 'connectionId-index',
        KeyConditionExpression: 'sk = :connectionId',
        ExpressionAttributeValues: {
          ':connectionId': connectionId,
        },
      })
    );

    // Delete all subscription records for this connection
    for (const item of result.Items || []) {
      await docClient.send(
        new DeleteCommand({
          TableName: CONNECTIONS_TABLE,
          Key: { pk: item.pk, sk: item.sk },
        })
      );
    }
  } catch (err) {
    console.error('Error cleaning up subscriptions:', err);
  }

  return { statusCode: 200, body: 'Disconnected' };
}

/**
 * Handle subscribe action
 * Message format: { action: "subscribe", automataId: "xxx", token: "xxx" }
 * Token is required for each subscribe to verify auth in real-time.
 */
async function handleSubscribe(
  event: APIGatewayProxyWebsocketEventV2,
  automataId: string,
  token: string
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;

  // Verify JWT in real-time using dynamic tenant config
  let auth: VerifiedToken;
  try {
    auth = await verifyJwtWithTenantConfig(token, getTenantConfig, TENANT_ID_CLAIM);
  } catch (err: unknown) {
    const message = err instanceof AuthError ? err.message : 'Invalid or expired token';
    await sendToConnection(connectionId, {
      type: 'error',
      message,
    });
    return { statusCode: 401, body: message };
  }

  // Validate automata exists
  const automataResult = await docClient.send(
    new GetCommand({
      TableName: AUTOMATA_TABLE,
      Key: { pk: automataId, sk: META_SK },
    })
  );

  if (!automataResult.Item) {
    await sendToConnection(connectionId, {
      type: 'error',
      message: `Automata not found: ${automataId}`,
    });
    return { statusCode: 400, body: 'Automata not found' };
  }

  const meta = automataResult.Item as AutomataMeta;

  // Verify ownership: user must be owner and tenant must match
  if (meta.tenantId !== auth.tenantId || meta.userId !== auth.userId) {
    await sendToConnection(connectionId, {
      type: 'error',
      message: 'Access denied',
    });
    return { statusCode: 403, body: 'Access denied' };
  }

  // Store subscription (only subscription, no auth info)
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: CONNECTIONS_TABLE,
      Item: {
        pk: automataId,
        sk: connectionId,
        subscribedAt: now,
      } as ConnectionRecord,
    })
  );

  // Send current state to client
  await sendToConnection(connectionId, {
    type: 'subscribed',
    automataId,
    state: meta.currentState,
    version: meta.version,
    timestamp: meta.updatedAt,
  });

  console.log(`Connection ${connectionId} subscribed to automata ${automataId}`);
  return { statusCode: 200, body: 'Subscribed' };
}

/**
 * Handle unsubscribe action
 * Message format: { action: "unsubscribe", automataId: "xxx" }
 */
async function handleUnsubscribe(
  event: APIGatewayProxyWebsocketEventV2,
  automataId: string
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;

  await docClient.send(
    new DeleteCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { pk: automataId, sk: connectionId },
    })
  );

  console.log(`Connection ${connectionId} unsubscribed from automata ${automataId}`);
  return { statusCode: 200, body: 'Unsubscribed' };
}

/**
 * Handle default route (message routing)
 */
async function handleDefault(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;

  if (!event.body) {
    await sendToConnection(connectionId, {
      type: 'error',
      message: 'Empty message',
    });
    return { statusCode: 400, body: 'Empty message' };
  }

  let message: { action?: string; automataId?: string; token?: string };
  try {
    message = JSON.parse(event.body);
  } catch {
    await sendToConnection(connectionId, {
      type: 'error',
      message: 'Invalid JSON',
    });
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { action, automataId, token } = message;

  if (!action) {
    await sendToConnection(connectionId, {
      type: 'error',
      message: 'Missing action field',
    });
    return { statusCode: 400, body: 'Missing action' };
  }

  if (!automataId) {
    await sendToConnection(connectionId, {
      type: 'error',
      message: 'Missing automataId field',
    });
    return { statusCode: 400, body: 'Missing automataId' };
  }

  switch (action) {
    case 'subscribe':
      if (!token) {
        await sendToConnection(connectionId, {
          type: 'error',
          message: 'Missing token for subscribe',
        });
        return { statusCode: 400, body: 'Missing token' };
      }
      return handleSubscribe(event, automataId, token);
    case 'unsubscribe':
      // No token required for unsubscribe (safe operation)
      return handleUnsubscribe(event, automataId);
    default:
      await sendToConnection(connectionId, {
        type: 'error',
        message: `Unknown action: ${action}`,
      });
      return { statusCode: 400, body: 'Unknown action' };
  }
}

/**
 * Handle DynamoDB Stream events (automata state changes)
 */
async function handleStream(event: DynamoDBStreamEvent): Promise<void> {
  for (const record of event.Records) {
    // Only process MODIFY events on non-META records (event records)
    if (record.eventName !== 'INSERT') continue;

    const newImage = record.dynamodb?.NewImage;
    if (!newImage) continue;

    // Check if this is an event record (sk is not #META)
    const sk = newImage.sk?.S;
    const pk = newImage.pk?.S;
    if (!sk || !pk || sk === META_SK) continue;

    // This is an event record
    const automataId = pk;
    const version = sk;
    const eventType = newImage.type?.S || 'unknown';
    const eventData = newImage.data ? JSON.parse(JSON.stringify(unmarshallValue(newImage.data))) : null;
    const nextState = newImage.nextState ? JSON.parse(JSON.stringify(unmarshallValue(newImage.nextState))) : null;
    const createdAt = newImage.createdAt?.S || new Date().toISOString();

    console.log(`Processing event ${version} for automata ${automataId}`);

    // Query all subscribers for this automata
    const subscribersResult = await docClient.send(
      new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        KeyConditionExpression: 'pk = :automataId',
        ExpressionAttributeValues: {
          ':automataId': automataId,
        },
      })
    );

    const subscribers = (subscribersResult.Items || []) as ConnectionRecord[];
    console.log(`Found ${subscribers.length} subscribers for automata ${automataId}`);

    // Send update to all subscribers
    const staleConnections: string[] = [];

    await Promise.all(
      subscribers.map(async (sub) => {
        const success = await sendToConnection(sub.sk, {
          type: 'state',
          automataId,
          event: { type: eventType, data: eventData },
          state: nextState,
          version,
          timestamp: createdAt,
        });

        if (!success) {
          staleConnections.push(sub.sk);
        }
      })
    );

    // Clean up stale connections
    for (const connectionId of staleConnections) {
      await docClient.send(
        new DeleteCommand({
          TableName: CONNECTIONS_TABLE,
          Key: { pk: automataId, sk: connectionId },
        })
      );
      console.log(`Cleaned up stale connection: ${connectionId}`);
    }
  }
}

/**
 * Simple DynamoDB attribute value unmarshaller
 */
function unmarshallValue(attr: Record<string, unknown>): unknown {
  if ('S' in attr) return attr.S;
  if ('N' in attr) return Number(attr.N);
  if ('BOOL' in attr) return attr.BOOL;
  if ('NULL' in attr) return null;
  if ('L' in attr) return (attr.L as Record<string, unknown>[]).map(unmarshallValue);
  if ('M' in attr) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attr.M as Record<string, Record<string, unknown>>)) {
      result[key] = unmarshallValue(value);
    }
    return result;
  }
  return attr;
}

/**
 * Main handler - routes based on event type
 */
export const handler = async (
  event: APIGatewayProxyWebsocketEventV2 | DynamoDBStreamEvent
): Promise<APIGatewayProxyResultV2 | void> => {
  try {
    // Check if this is a DynamoDB Stream event
    if ('Records' in event && event.Records?.[0]?.eventSource === 'aws:dynamodb') {
      return await handleStream(event as DynamoDBStreamEvent);
    }

    // WebSocket event
    const wsEvent = event as APIGatewayProxyWebsocketEventV2;
    const routeKey = wsEvent.requestContext.routeKey;

    switch (routeKey) {
      case '$connect':
        return await handleConnect(wsEvent);
      case '$disconnect':
        return await handleDisconnect(wsEvent);
      default:
        return await handleDefault(wsEvent);
    }
  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
