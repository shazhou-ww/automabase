/**
 * WebSocket connection management utilities
 */

import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  GetCommand,
  type PutCommandInput,
  type DeleteCommandInput,
  type QueryCommandInput,
  type GetCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  DeleteConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

// Table name for connections
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'automabase-connections';

// WebSocket endpoint
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT || '';

// DynamoDB client
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// API Gateway Management client (lazy initialized)
let apiGwClient: ApiGatewayManagementApiClient | null = null;

function getApiGwClient(): ApiGatewayManagementApiClient {
  if (!apiGwClient) {
    apiGwClient = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT,
    });
  }
  return apiGwClient;
}

/**
 * Connection record stored in DynamoDB
 */
export interface ConnectionRecord {
  connectionId: string;
  tenantId: string;
  subjectId: string;
  connectedAt: string;
}

/**
 * Subscription record stored in DynamoDB
 */
export interface SubscriptionRecord {
  /** PK: CONNECTION#{connectionId} */
  pk: string;
  /** SK: SUBSCRIPTION#{automataId} */
  sk: string;
  connectionId: string;
  automataId: string;
  tenantId: string;
  realmId: string;
  subscribedAt: string;
}

/**
 * Store a new connection
 */
export async function storeConnection(
  connectionId: string,
  tenantId: string,
  subjectId: string
): Promise<void> {
  const params: PutCommandInput = {
    TableName: CONNECTIONS_TABLE,
    Item: {
      pk: `CONNECTION#${connectionId}`,
      sk: '#META',
      connectionId,
      tenantId,
      subjectId,
      connectedAt: new Date().toISOString(),
    },
  };

  await docClient.send(new PutCommand(params));
}

/**
 * Get connection info
 */
export async function getConnection(connectionId: string): Promise<ConnectionRecord | null> {
  const params: GetCommandInput = {
    TableName: CONNECTIONS_TABLE,
    Key: {
      pk: `CONNECTION#${connectionId}`,
      sk: '#META',
    },
  };

  const result = await docClient.send(new GetCommand(params));

  if (!result.Item) {
    return null;
  }

  return {
    connectionId: result.Item.connectionId,
    tenantId: result.Item.tenantId,
    subjectId: result.Item.subjectId,
    connectedAt: result.Item.connectedAt,
  };
}

/**
 * Delete a connection and all its subscriptions
 */
export async function deleteConnection(connectionId: string): Promise<void> {
  // First, query all subscriptions for this connection
  const queryParams: QueryCommandInput = {
    TableName: CONNECTIONS_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': `CONNECTION#${connectionId}`,
    },
  };

  const queryResult = await docClient.send(new QueryCommand(queryParams));

  // Delete all items (connection meta + subscriptions)
  for (const item of queryResult.Items ?? []) {
    const deleteParams: DeleteCommandInput = {
      TableName: CONNECTIONS_TABLE,
      Key: {
        pk: item.pk,
        sk: item.sk,
      },
    };
    await docClient.send(new DeleteCommand(deleteParams));
  }
}

/**
 * Add a subscription for a connection
 */
export async function addSubscription(
  connectionId: string,
  automataId: string,
  tenantId: string,
  realmId: string
): Promise<void> {
  const params: PutCommandInput = {
    TableName: CONNECTIONS_TABLE,
    Item: {
      pk: `CONNECTION#${connectionId}`,
      sk: `SUBSCRIPTION#${automataId}`,
      connectionId,
      automataId,
      tenantId,
      realmId,
      subscribedAt: new Date().toISOString(),
      // GSI for querying subscriptions by automata
      gsi1pk: `AUTOMATA#${automataId}`,
      gsi1sk: connectionId,
    },
  };

  await docClient.send(new PutCommand(params));
}

/**
 * Remove a subscription
 */
export async function removeSubscription(
  connectionId: string,
  automataId: string
): Promise<void> {
  const params: DeleteCommandInput = {
    TableName: CONNECTIONS_TABLE,
    Key: {
      pk: `CONNECTION#${connectionId}`,
      sk: `SUBSCRIPTION#${automataId}`,
    },
  };

  await docClient.send(new DeleteCommand(params));
}

/**
 * Get all connections subscribed to an automata
 */
export async function getSubscribersForAutomata(
  automataId: string
): Promise<string[]> {
  const params: QueryCommandInput = {
    TableName: CONNECTIONS_TABLE,
    IndexName: 'gsi1-automata-index',
    KeyConditionExpression: 'gsi1pk = :pk',
    ExpressionAttributeValues: {
      ':pk': `AUTOMATA#${automataId}`,
    },
  };

  const result = await docClient.send(new QueryCommand(params));

  return (result.Items ?? []).map((item) => item.connectionId);
}

/**
 * Send a message to a connection
 */
export async function sendToConnection(
  connectionId: string,
  message: unknown
): Promise<boolean> {
  const client = getApiGwClient();

  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(message),
      })
    );
    return true;
  } catch (error: unknown) {
    // Check if connection is gone
    if (error && typeof error === 'object' && 'name' in error) {
      const err = error as { name: string };
      if (err.name === 'GoneException') {
        // Connection is no longer valid, clean up
        await deleteConnection(connectionId);
        return false;
      }
    }
    throw error;
  }
}

/**
 * Disconnect a connection
 */
export async function disconnectConnection(connectionId: string): Promise<void> {
  const client = getApiGwClient();

  try {
    await client.send(
      new DeleteConnectionCommand({
        ConnectionId: connectionId,
      })
    );
  } catch {
    // Ignore errors - connection may already be gone
  }

  await deleteConnection(connectionId);
}
