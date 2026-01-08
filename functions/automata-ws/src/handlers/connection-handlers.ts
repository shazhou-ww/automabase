/**
 * WebSocket Connection Handlers
 * Based on BUSINESS_MODEL_SPEC.md Section 5.6
 */

import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { verifyToken } from '../utils/auth';
import { storeConnection, deleteConnection } from '../utils/connections';

/**
 * WebSocket connect event type (includes query string parameters)
 */
interface WebSocketConnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
  };
  queryStringParameters?: Record<string, string>;
}

/**
 * Handle $connect event
 * Validates JWT and stores connection
 */
export async function handleConnect(
  event: WebSocketConnectEvent
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  console.log('Connect:', connectionId);

  // Get token from query string
  const token = event.queryStringParameters?.token;

  if (!token) {
    console.log('No token provided');
    return { statusCode: 401, body: 'Unauthorized: No token provided' };
  }

  // Verify token
  const authResult = await verifyToken(token);

  if (!authResult) {
    console.log('Invalid token');
    return { statusCode: 401, body: 'Unauthorized: Invalid token' };
  }

  try {
    // Store connection
    await storeConnection(
      connectionId,
      authResult.token.tenantId,
      authResult.token.subjectId
    );

    console.log('Connection stored:', connectionId, authResult.token.tenantId);
    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    console.error('Error storing connection:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}

/**
 * WebSocket disconnect event type
 */
interface WebSocketDisconnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
  };
}

/**
 * Handle $disconnect event
 * Cleans up connection and subscriptions
 */
export async function handleDisconnect(
  event: WebSocketDisconnectEvent
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  console.log('Disconnect:', connectionId);

  try {
    await deleteConnection(connectionId);
    console.log('Connection deleted:', connectionId);
    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('Error deleting connection:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}
