/**
 * Batch Operation Handlers
 * Phase 3: Batch operations for sending events and querying states
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getAutomata,
  createEventWithStateUpdate,
  createEventId,
  type BatchSendEventsToAutomataRequest,
  type BatchSendEventsToRealmRequest,
  type BatchSendEventsToAutomataResponse,
  type BatchSendEventsToRealmResponse,
  type BatchGetStatesRequest,
  type BatchGetStatesResponse,
  type BatchEventResult,
  type BatchStateResult,
  type AutomataStateResponse,
} from '@automabase/automata-core';
import type { AuthContext } from '../utils/auth-middleware';
import { executeTransition } from '../utils/jsonata-runner';
import { ok, badRequest, forbidden, notFound, internalError } from '../utils/response-helpers';

/**
 * POST /automatas/{automataId}/events/batch
 * Send multiple events to a single automata sequentially
 *
 * Permission: realm:{realmId}:readwrite or automata:{automataId}:readwrite
 */
export async function handleBatchSendEventsToAutomata(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const automataId = event.pathParameters?.automataId;

  if (!automataId) {
    return badRequest('Missing automataId path parameter');
  }

  // Parse request body
  let request: BatchSendEventsToAutomataRequest;
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }
    request = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate request
  if (request.automataId !== automataId) {
    return badRequest('automataId in path and body must match');
  }

  if (!Array.isArray(request.events) || request.events.length === 0) {
    return badRequest('events must be a non-empty array');
  }

  if (request.events.length > 100) {
    return badRequest('Maximum 100 events per batch');
  }

  try {
    // Get automata
    let automata = await getAutomata(automataId);

    if (!automata) {
      return notFound('Automata not found');
    }

    // Check tenant ownership
    if (automata.tenantId !== auth.token.tenantId) {
      return forbidden('Access denied');
    }

    // Check permission
    if (!auth.permissions.canWriteAutomata(automataId, automata.realmId)) {
      return forbidden('Insufficient permissions to send events');
    }

    // Check automata status
    if (automata.status === 'archived') {
      return badRequest('Cannot send events to archived automata');
    }

    const results: BatchEventResult[] = [];
    let lastSuccessfulIndex = -1;
    let currentState = automata.currentState;
    let currentVersion = automata.version;

    // Process events sequentially
    for (let i = 0; i < request.events.length; i++) {
      const eventRequest = request.events[i];

      // Validate event type
      if (!eventRequest.eventType || typeof eventRequest.eventType !== 'string') {
        results.push({
          success: false,
          eventIndex: i,
          error: 'eventType is required and must be a string',
        });
        continue;
      }

      // Check if event type is valid
      const eventSchemas = automata.descriptor.eventSchemas;
      if (!eventSchemas[eventRequest.eventType]) {
        results.push({
          success: false,
          eventIndex: i,
          error: `Unknown event type: ${eventRequest.eventType}`,
        });
        continue;
      }

      try {
        // Re-fetch automata to get latest state (for version conflict detection)
        const latestAutomata = await getAutomata(automataId);
        if (!latestAutomata) {
          results.push({
            success: false,
            eventIndex: i,
            error: 'Automata not found',
          });
          break;
        }

        // Check for version mismatch (concurrent modification)
        if (latestAutomata.version !== currentVersion) {
          results.push({
            success: false,
            eventIndex: i,
            error: 'Version conflict - automata was modified concurrently',
          });
          break;
        }

        // Execute transition
        let newState: unknown;
        try {
          newState = await executeTransition(
            automata.descriptor.transition,
            currentState,
            eventRequest.eventType,
            eventRequest.eventData
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          results.push({
            success: false,
            eventIndex: i,
            error: `Transition execution failed: ${message}`,
          });
          break;
        }

        // Create event record
        const now = new Date().toISOString();
        const automataEvent = {
          automataId,
          baseVersion: currentVersion,
          eventType: eventRequest.eventType,
          eventData: eventRequest.eventData,
          senderSubjectId: auth.token.subjectId,
          timestamp: now,
        };

        // Create event and update state atomically
        const result = await createEventWithStateUpdate(
          automataEvent,
          automataId,
          currentVersion,
          newState
        );

        if (!result.success) {
          results.push({
            success: false,
            eventIndex: i,
            error: 'Version conflict - automata was modified concurrently',
          });
          break;
        }

        // Success
        results.push({
          success: true,
          eventIndex: i,
          eventId: createEventId(automataId, currentVersion),
          baseVersion: currentVersion,
          newVersion: result.newVersion,
          newState,
        });

        lastSuccessfulIndex = i;
        currentState = newState;
        currentVersion = result.newVersion;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          success: false,
          eventIndex: i,
          error: `Internal error: ${message}`,
        });
        break;
      }
    }

    const successfulCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    const response: BatchSendEventsToAutomataResponse = {
      automataId,
      results,
      lastSuccessfulIndex,
      totalEvents: request.events.length,
      successfulCount,
      failedCount,
    };

    return ok(response);
  } catch (error) {
    console.error('Error in batch send events:', error);
    return internalError('Failed to process batch events');
  }
}

/**
 * POST /realms/{realmId}/events/batch
 * Send events to multiple automatas in the same realm
 *
 * Permission: realm:{realmId}:readwrite
 */
export async function handleBatchSendEventsToRealm(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const realmId = event.pathParameters?.realmId;

  if (!realmId) {
    return badRequest('Missing realmId path parameter');
  }

  // Parse request body
  let request: BatchSendEventsToRealmRequest;
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }
    request = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate request
  if (request.realmId !== realmId) {
    return badRequest('realmId in path and body must match');
  }

  if (!Array.isArray(request.automatas) || request.automatas.length === 0) {
    return badRequest('automatas must be a non-empty array');
  }

  if (request.automatas.length > 50) {
    return badRequest('Maximum 50 automatas per batch');
  }

  // Check permission
  if (!auth.permissions.canWriteRealm(realmId)) {
    return forbidden('Insufficient permissions to send events to realm');
  }

  const automataResults = [];

  // Process each automata independently
  for (const automataRequest of request.automatas) {
    const { automataId, events } = automataRequest;

    if (!automataId || typeof automataId !== 'string') {
      automataResults.push({
        automataId: automataId || 'unknown',
        results: [],
        lastSuccessfulIndex: -1,
        successfulCount: 0,
        failedCount: 0,
      });
      continue;
    }

    if (!Array.isArray(events) || events.length === 0) {
      automataResults.push({
        automataId,
        results: [],
        lastSuccessfulIndex: -1,
        successfulCount: 0,
        failedCount: 0,
      });
      continue;
    }

    try {
      // Get automata
      const automata = await getAutomata(automataId);

      if (!automata) {
        automataResults.push({
          automataId,
          results: [
            {
              success: false,
              eventIndex: 0,
              error: 'Automata not found',
            },
          ],
          lastSuccessfulIndex: -1,
          successfulCount: 0,
          failedCount: 1,
        });
        continue;
      }

      // Check tenant ownership
      if (automata.tenantId !== auth.token.tenantId) {
        automataResults.push({
          automataId,
          results: [
            {
              success: false,
              eventIndex: 0,
              error: 'Access denied',
            },
          ],
          lastSuccessfulIndex: -1,
          successfulCount: 0,
          failedCount: 1,
        });
        continue;
      }

      // Check realm match
      if (automata.realmId !== realmId) {
        automataResults.push({
          automataId,
          results: [
            {
              success: false,
              eventIndex: 0,
              error: 'Automata does not belong to the specified realm',
            },
          ],
          lastSuccessfulIndex: -1,
          successfulCount: 0,
          failedCount: 1,
        });
        continue;
      }

      // Check automata status
      if (automata.status === 'archived') {
        automataResults.push({
          automataId,
          results: [
            {
              success: false,
              eventIndex: 0,
              error: 'Cannot send events to archived automata',
            },
          ],
          lastSuccessfulIndex: -1,
          successfulCount: 0,
          failedCount: 1,
        });
        continue;
      }

      // Process events sequentially for this automata
      const results: BatchEventResult[] = [];
      let lastSuccessfulIndex = -1;
      let currentState = automata.currentState;
      let currentVersion = automata.version;

      for (let i = 0; i < events.length; i++) {
        const eventRequest = events[i];

        // Validate event type
        if (!eventRequest.eventType || typeof eventRequest.eventType !== 'string') {
          results.push({
            success: false,
            eventIndex: i,
            error: 'eventType is required and must be a string',
          });
          continue;
        }

        // Check if event type is valid
        const eventSchemas = automata.descriptor.eventSchemas;
        if (!eventSchemas[eventRequest.eventType]) {
          results.push({
            success: false,
            eventIndex: i,
            error: `Unknown event type: ${eventRequest.eventType}`,
          });
          continue;
        }

        try {
          // Re-fetch automata to get latest state
          const latestAutomata = await getAutomata(automataId);
          if (!latestAutomata) {
            results.push({
              success: false,
              eventIndex: i,
              error: 'Automata not found',
            });
            break;
          }

          // Check for version mismatch
          if (latestAutomata.version !== currentVersion) {
            results.push({
              success: false,
              eventIndex: i,
              error: 'Version conflict - automata was modified concurrently',
            });
            break;
          }

          // Execute transition
          let newState: unknown;
          try {
            newState = await executeTransition(
              automata.descriptor.transition,
              currentState,
              eventRequest.eventType,
              eventRequest.eventData
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            results.push({
              success: false,
              eventIndex: i,
              error: `Transition execution failed: ${message}`,
            });
            break;
          }

          // Create event record
          const now = new Date().toISOString();
          const automataEvent = {
            automataId,
            baseVersion: currentVersion,
            eventType: eventRequest.eventType,
            eventData: eventRequest.eventData,
            senderSubjectId: auth.token.subjectId,
            timestamp: now,
          };

          // Create event and update state atomically
          const result = await createEventWithStateUpdate(
            automataEvent,
            automataId,
            currentVersion,
            newState
          );

          if (!result.success) {
            results.push({
              success: false,
              eventIndex: i,
              error: 'Version conflict - automata was modified concurrently',
            });
            break;
          }

          // Success
          results.push({
            success: true,
            eventIndex: i,
            eventId: createEventId(automataId, currentVersion),
            baseVersion: currentVersion,
            newVersion: result.newVersion,
            newState,
          });

          lastSuccessfulIndex = i;
          currentState = newState;
          currentVersion = result.newVersion;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          results.push({
            success: false,
            eventIndex: i,
            error: `Internal error: ${message}`,
          });
          break;
        }
      }

      const successfulCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      automataResults.push({
        automataId,
        results,
        lastSuccessfulIndex,
        successfulCount,
        failedCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      automataResults.push({
        automataId,
        results: [
          {
            success: false,
            eventIndex: 0,
            error: `Internal error: ${message}`,
          },
        ],
        lastSuccessfulIndex: -1,
        successfulCount: 0,
        failedCount: 1,
      });
    }
  }

  const fullySuccessfulAutomatas = automataResults.filter(
    (r) => r.failedCount === 0 && r.successfulCount > 0
  ).length;
  const partiallyFailedAutomatas = automataResults.filter((r) => r.failedCount > 0).length;

  const response: BatchSendEventsToRealmResponse = {
    realmId,
    automatas: automataResults,
    totalAutomatas: request.automatas.length,
    fullySuccessfulAutomatas,
    partiallyFailedAutomatas,
  };

  return ok(response);
}

/**
 * POST /automatas/batch/states
 * Get states for multiple automatas
 *
 * Permission: realm:{realmId}:read or automata:{automataId}:read for each automata
 */
export async function handleBatchGetStates(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  // Parse request body
  let request: BatchGetStatesRequest;
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }
    request = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate request
  if (!Array.isArray(request.automataIds) || request.automataIds.length === 0) {
    return badRequest('automataIds must be a non-empty array');
  }

  if (request.automataIds.length > 100) {
    return badRequest('Maximum 100 automatas per batch');
  }

  const results: BatchStateResult[] = [];

  // Process each automata independently
  for (const automataId of request.automataIds) {
    try {
      const automata = await getAutomata(automataId);

      if (!automata) {
        results.push({
          automataId,
          success: false,
          error: 'Automata not found',
        });
        continue;
      }

      // Check tenant ownership
      if (automata.tenantId !== auth.token.tenantId) {
        results.push({
          automataId,
          success: false,
          error: 'Access denied',
        });
        continue;
      }

      // Check permission
      if (!auth.permissions.canReadAutomata(automataId, automata.realmId)) {
        results.push({
          automataId,
          success: false,
          error: 'Insufficient permissions',
        });
        continue;
      }

      // Success
      const stateResponse: AutomataStateResponse = {
        automataId,
        currentState: automata.currentState,
        version: automata.version,
        status: automata.status,
        updatedAt: automata.updatedAt,
      };

      results.push({
        automataId,
        success: true,
        state: stateResponse,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        automataId,
        success: false,
        error: `Internal error: ${message}`,
      });
    }
  }

  const successfulCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  const response: BatchGetStatesResponse = {
    results,
    successfulCount,
    failedCount,
  };

  return ok(response);
}

