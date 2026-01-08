/**
 * Event API Handlers
 * Based on BUSINESS_MODEL_SPEC.md Section 5.5
 */

import type {
  AutomataEvent,
  EventQueryDirection,
  EventResponse,
  ListEventsResponse,
  SendEventRequest,
  SendEventResponse,
} from '@automabase/automata-core';
import {
  createEventId,
  createEventWithStateUpdate,
  executeTransition,
  getAutomata,
  getEvent,
  isValidVersion,
  listEvents,
} from '@automabase/automata-core';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AuthContext } from '../utils/auth-middleware';
import {
  badRequest,
  conflict,
  created,
  forbidden,
  internalError,
  notFound,
  ok,
} from '../utils/response-helpers';

/**
 * POST /automatas/{automataId}/events
 * Send event to automata
 *
 * Permission: realm:{realmId}:readwrite or automata:{automataId}:readwrite
 */
export async function handleSendEvent(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const automataId = event.pathParameters?.automataId;

  if (!automataId) {
    return badRequest('Missing automataId path parameter');
  }

  // Parse request body
  let request: SendEventRequest;
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }
    request = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate required fields
  if (!request.eventType || typeof request.eventType !== 'string') {
    return badRequest('eventType is required and must be a string');
  }

  try {
    const automata = await getAutomata(automataId);

    if (!automata) {
      return notFound('Automata not found');
    }

    // Check tenant ownership
    if (automata.tenantId !== auth.token.tenantId) {
      return forbidden('Access denied');
    }

    // Check permission
    if (!auth.permissions.canWriteAutomata(automataId, automata.realmId)) {
      return forbidden('Insufficient permissions to send event');
    }

    // Check automata status
    if (automata.status === 'archived') {
      return badRequest('Cannot send event to archived automata');
    }

    // Validate event type against schema
    const eventSchemas = automata.descriptor.eventSchemas;
    if (!eventSchemas[request.eventType]) {
      return badRequest(
        `Unknown event type: ${request.eventType}. Valid types: ${Object.keys(eventSchemas).join(', ')}`
      );
    }

    // TODO: Validate event data against schema

    // Execute transition
    const oldState = automata.currentState;
    let newState: unknown;

    try {
      newState = await executeTransition(
        automata.descriptor.transition,
        automata.currentState,
        request.eventType,
        request.eventData
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return badRequest(`Transition execution failed: ${message}`);
    }

    // TODO: Validate new state against schema

    // Create event record
    const now = new Date().toISOString();
    const automataEvent: AutomataEvent = {
      automataId,
      baseVersion: automata.version,
      eventType: request.eventType,
      eventData: request.eventData,
      senderSubjectId: auth.token.subjectId,
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
      return conflict('Version conflict - automata was modified concurrently');
    }

    const response: SendEventResponse = {
      eventId: createEventId(automataId, automata.version),
      baseVersion: automata.version,
      newVersion: result.newVersion,
      newState,
      timestamp: now,
    };

    // Include old state if requested
    const includeOldState = event.queryStringParameters?.include === 'oldState';
    if (includeOldState) {
      response.oldState = oldState;
    }

    return created(response);
  } catch (error) {
    console.error('Error sending event:', error);
    return internalError('Failed to send event');
  }
}

/**
 * GET /automatas/{automataId}/events
 * List events for automata
 *
 * Permission: realm:{realmId}:read or automata:{automataId}:read
 */
export async function handleListEvents(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const automataId = event.pathParameters?.automataId;

  if (!automataId) {
    return badRequest('Missing automataId path parameter');
  }

  try {
    const automata = await getAutomata(automataId);

    if (!automata) {
      return notFound('Automata not found');
    }

    // Check tenant ownership
    if (automata.tenantId !== auth.token.tenantId) {
      return forbidden('Access denied');
    }

    // Check permission
    if (!auth.permissions.canReadAutomata(automataId, automata.realmId)) {
      return forbidden('Insufficient permissions to list events');
    }

    // Parse query params
    const direction = (event.queryStringParameters?.direction ?? 'backward') as EventQueryDirection;
    if (direction !== 'forward' && direction !== 'backward') {
      return badRequest('direction must be "forward" or "backward"');
    }

    const anchor = event.queryStringParameters?.anchor;
    if (anchor && !isValidVersion(anchor)) {
      return badRequest('Invalid anchor version format');
    }

    const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit ?? '100', 10), 1000);

    const result = await listEvents(automataId, {
      direction,
      anchor,
      limit,
    });

    const response: ListEventsResponse = {
      events: result.events,
      nextAnchor: result.nextAnchor,
    };

    return ok(response);
  } catch (error) {
    console.error('Error listing events:', error);
    return internalError('Failed to list events');
  }
}

/**
 * GET /automatas/{automataId}/events/{version}
 * Get single event by version
 *
 * Permission: realm:{realmId}:read or automata:{automataId}:read
 */
export async function handleGetEvent(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const automataId = event.pathParameters?.automataId;
  const version = event.pathParameters?.version;

  if (!automataId) {
    return badRequest('Missing automataId path parameter');
  }

  if (!version) {
    return badRequest('Missing version path parameter');
  }

  if (!isValidVersion(version)) {
    return badRequest('Invalid version format');
  }

  try {
    const automata = await getAutomata(automataId);

    if (!automata) {
      return notFound('Automata not found');
    }

    // Check tenant ownership
    if (automata.tenantId !== auth.token.tenantId) {
      return forbidden('Access denied');
    }

    // Check permission
    if (!auth.permissions.canReadAutomata(automataId, automata.realmId)) {
      return forbidden('Insufficient permissions to read event');
    }

    const automataEvent = await getEvent(automataId, version);

    if (!automataEvent) {
      return notFound('Event not found');
    }

    const response: EventResponse = {
      eventId: createEventId(automataId, version),
      automataId,
      baseVersion: automataEvent.baseVersion,
      eventType: automataEvent.eventType,
      eventData: automataEvent.eventData,
      senderSubjectId: automataEvent.senderSubjectId,
      timestamp: automataEvent.timestamp,
    };

    return ok(response);
  } catch (error) {
    console.error('Error getting event:', error);
    return internalError('Failed to get event');
  }
}
