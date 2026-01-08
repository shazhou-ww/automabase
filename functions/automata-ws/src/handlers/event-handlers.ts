/**
 * WebSocket Event Handlers
 * Phase 3: Send events via WebSocket
 */

import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  getAutomata,
  createEventWithStateUpdate,
  createEventId,
  PermissionChecker,
} from '@automabase/automata-core';
import { verifyToken } from '../utils/auth';
import { getConnection, sendToConnection } from '../utils/connections';
// Note: executeTransition is imported from automata-api utils
// We'll need to create a shared utility or import it differently

/**
 * Send event message format
 */
interface SendEventMessage {
  action: 'sendEvent';
  automataId: string;
  eventType: string;
  eventData: unknown;
  token?: string;
}

/**
 * Event sent response
 */
interface EventSentResponse {
  type: 'eventSent';
  automataId: string;
  eventId: string;
  baseVersion: string;
  newVersion: string;
  newState: unknown;
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
 * Handle send event action via WebSocket
 */
export async function handleSendEvent(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  console.log('Send Event via WebSocket:', connectionId);

  // Parse message
  let message: SendEventMessage;
  try {
    message = JSON.parse(event.body ?? '{}');
  } catch {
    await sendError(connectionId, 'Invalid JSON');
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { automataId, eventType, eventData, token } = message;

  if (!automataId) {
    await sendError(connectionId, 'automataId is required');
    return { statusCode: 400, body: 'automataId is required' };
  }

  if (!eventType || typeof eventType !== 'string') {
    await sendError(connectionId, 'eventType is required and must be a string');
    return { statusCode: 400, body: 'eventType is required' };
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
    // Use connection's original permissions (stored at connect time)
    // For now, require token on sendEvent for security
    await sendError(connectionId, 'token is required for sendEvent');
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
    if (!permissions.canWriteAutomata(automataId, automata.realmId)) {
      await sendError(connectionId, 'Insufficient permissions', 'FORBIDDEN');
      return { statusCode: 403, body: 'Insufficient permissions' };
    }

    // Check automata status
    if (automata.status === 'archived') {
      await sendError(connectionId, 'Cannot send event to archived automata', 'BAD_REQUEST');
      return { statusCode: 400, body: 'Cannot send event to archived automata' };
    }

    // Validate event type against schema
    const eventSchemas = automata.descriptor.eventSchemas;
    if (!eventSchemas[eventType]) {
      await sendError(
        connectionId,
        `Unknown event type: ${eventType}. Valid types: ${Object.keys(eventSchemas).join(', ')}`,
        'BAD_REQUEST'
      );
      return { statusCode: 400, body: 'Unknown event type' };
    }

    // Execute transition
    let newState: unknown;
    try {
      newState = await executeTransition(
        automata.descriptor.transition,
        automata.currentState,
        eventType,
        eventData
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await sendError(connectionId, `Transition execution failed: ${message}`, 'BAD_REQUEST');
      return { statusCode: 400, body: 'Transition execution failed' };
    }

    // Create event record
    const now = new Date().toISOString();
    const automataEvent = {
      automataId,
      baseVersion: automata.version,
      eventType,
      eventData,
      senderSubjectId: connection.subjectId,
      timestamp: now,
    };

    // Create event and update state atomically
    const result = await createEventWithStateUpdate(
      automataEvent,
      automataId,
      automata.version,
      newState
    );

    if (!result.success) {
      await sendError(connectionId, 'Version conflict - automata was modified concurrently', 'CONFLICT');
      return { statusCode: 409, body: 'Version conflict' };
    }

    // Send success response
    const response: EventSentResponse = {
      type: 'eventSent',
      automataId,
      eventId: createEventId(automataId, automata.version),
      baseVersion: automata.version,
      newVersion: result.newVersion,
      newState,
      timestamp: now,
    };

    await sendToConnection(connectionId, response);

    console.log('Event sent via WebSocket:', connectionId, automataId, eventType);
    return { statusCode: 200, body: 'Event sent' };
  } catch (error) {
    console.error('Error sending event via WebSocket:', error);
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

