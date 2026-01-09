/**
 * WebSocket Subscription Handlers
 * Based on BUSINESS_MODEL_SPEC.md Section 5.6
 */

import { getAutomata, type PermissionChecker } from '@automabase/automata-core';
import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { verifyToken } from '../utils/auth';
import {
  addSubscription,
  getConnection,
  removeSubscription,
  sendToConnection,
} from '../utils/connections';

/**
 * Subscribe message format
 */
interface SubscribeMessage {
  action: 'subscribe';
  automataId: string;
  token?: string;
}

/**
 * Unsubscribe message format
 */
interface UnsubscribeMessage {
  action: 'unsubscribe';
  automataId: string;
}

/**
 * Subscribed response
 */
interface SubscribedResponse {
  type: 'subscribed';
  automataId: string;
  state: unknown;
  version: string;
  timestamp: string;
}

/**
 * Error response
 */
interface ErrorResponse {
  type: 'error';
  message: string;
  code?: string;
}

/**
 * Handle subscribe action
 */
export async function handleSubscribe(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  console.log('Subscribe:', connectionId);

  // Parse message
  let message: SubscribeMessage;
  try {
    message = JSON.parse(event.body ?? '{}');
  } catch {
    await sendError(connectionId, 'Invalid JSON');
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { automataId, token } = message;

  if (!automataId) {
    await sendError(connectionId, 'automataId is required');
    return { statusCode: 400, body: 'automataId is required' };
  }

  // Get connection info
  const connection = await getConnection(connectionId);
  if (!connection) {
    await sendError(connectionId, 'Connection not found');
    return { statusCode: 400, body: 'Connection not found' };
  }

  // Verify token if provided (for refreshing permissions)
  let permissions: PermissionChecker;
  if (token) {
    const authResult = await verifyToken(token);
    if (!authResult) {
      await sendError(connectionId, 'Invalid token');
      return { statusCode: 401, body: 'Invalid token' };
    }
    permissions = authResult.permissions;
  } else {
    // Use empty permissions - will need to check connection's original scopes
    // For simplicity, require token on subscribe
    await sendError(connectionId, 'token is required for subscribe');
    return { statusCode: 400, body: 'token is required' };
  }

  try {
    // Get automata
    const automata = await getAutomata(automataId);

    if (!automata) {
      await sendError(connectionId, 'Automata not found', 'NOT_FOUND');
      return { statusCode: 404, body: 'Automata not found' };
    }

    // Check tenant ownership
    if (automata.tenantId !== connection.tenantId) {
      await sendError(connectionId, 'Access denied', 'FORBIDDEN');
      return { statusCode: 403, body: 'Access denied' };
    }

    // Check permission
    if (!permissions.canReadAutomata(automataId, automata.realmId)) {
      await sendError(connectionId, 'Insufficient permissions', 'FORBIDDEN');
      return { statusCode: 403, body: 'Insufficient permissions' };
    }

    // Add subscription
    await addSubscription(connectionId, automataId, automata.tenantId, automata.realmId);

    // Send current state
    const response: SubscribedResponse = {
      type: 'subscribed',
      automataId,
      state: automata.currentState,
      version: automata.version,
      timestamp: new Date().toISOString(),
    };

    await sendToConnection(connectionId, response);

    console.log('Subscribed:', connectionId, automataId);
    return { statusCode: 200, body: 'Subscribed' };
  } catch (error) {
    console.error('Error subscribing:', error);
    await sendError(connectionId, 'Internal error');
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}

/**
 * Handle unsubscribe action
 */
export async function handleUnsubscribe(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  console.log('Unsubscribe:', connectionId);

  // Parse message
  let message: UnsubscribeMessage;
  try {
    message = JSON.parse(event.body ?? '{}');
  } catch {
    await sendError(connectionId, 'Invalid JSON');
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { automataId } = message;

  if (!automataId) {
    await sendError(connectionId, 'automataId is required');
    return { statusCode: 400, body: 'automataId is required' };
  }

  try {
    await removeSubscription(connectionId, automataId);

    // Send confirmation
    await sendToConnection(connectionId, {
      type: 'unsubscribed',
      automataId,
    });

    console.log('Unsubscribed:', connectionId, automataId);
    return { statusCode: 200, body: 'Unsubscribed' };
  } catch (error) {
    console.error('Error unsubscribing:', error);
    await sendError(connectionId, 'Internal error');
    return { statusCode: 500, body: 'Internal Server Error' };
  }
}

/**
 * Send error message to connection
 */
async function sendError(connectionId: string, message: string, code?: string): Promise<void> {
  const response: ErrorResponse = {
    type: 'error',
    message,
    code,
  };

  try {
    await sendToConnection(connectionId, response);
  } catch (error) {
    console.error('Error sending error message:', error);
  }
}
