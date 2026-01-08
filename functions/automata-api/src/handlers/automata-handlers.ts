/**
 * Automata API Handlers
 * Based on BUSINESS_MODEL_SPEC.md Section 5.4
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getAutomata,
  createAutomata,
  listAutomatasInRealm,
  archiveAutomata,
} from '@automabase/automata-core';
import {
  computeDescriptorHash,
  type AutomataDescriptor,
} from '@automabase/automata-auth';
import type {
  CreateAutomataRequest,
  CreateAutomataResponse,
  ListAutomatasResponse,
  AutomataStateResponse,
  AutomataDescriptorResponse,
  UpdateAutomataRequest,
  UpdateAutomataResponse,
} from '@automabase/automata-core';
import type { AuthContext } from '../utils/auth-middleware';
import { ok, created, badRequest, forbidden, notFound, internalError } from '../utils/response-helpers';

/**
 * POST /realms/{realmId}/automatas
 * Create a new automata
 *
 * Permission: realm:{realmId}:readwrite
 */
export async function handleCreateAutomata(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const realmId = event.pathParameters?.realmId;

  if (!realmId) {
    return badRequest('Missing realmId path parameter');
  }

  // Check permission
  if (!auth.permissions.canWriteRealm(realmId)) {
    return forbidden('Insufficient permissions to create automata in this realm');
  }

  // Parse request body
  let request: CreateAutomataRequest;
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }
    request = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate required fields
  if (!request.descriptor) {
    return badRequest('descriptor is required');
  }

  if (!request.descriptorSignature) {
    return badRequest('descriptorSignature is required');
  }

  const { descriptor } = request;

  // Validate descriptor structure
  if (!descriptor.name || typeof descriptor.name !== 'string') {
    return badRequest('descriptor.name is required and must be a string');
  }

  if (!descriptor.stateSchema) {
    return badRequest('descriptor.stateSchema is required');
  }

  if (!descriptor.eventSchemas || typeof descriptor.eventSchemas !== 'object') {
    return badRequest('descriptor.eventSchemas is required and must be an object');
  }

  if (!descriptor.transition || typeof descriptor.transition !== 'string') {
    return badRequest('descriptor.transition is required and must be a string');
  }

  if (descriptor.initialState === undefined) {
    return badRequest('descriptor.initialState is required');
  }

  try {
    // Verify descriptor signature
    // Note: In production, we would fetch the tenant's JWKS and verify the signature
    // For now, we'll compute the hash and trust the signature
    const descriptorHash = await computeDescriptorHash(descriptor as AutomataDescriptor);

    // Create automata
    const automata = await createAutomata(
      auth.token.tenantId,
      realmId,
      auth.token.subjectId,
      request,
      descriptorHash
    );

    const response: CreateAutomataResponse = {
      automataId: automata.automataId,
      createdAt: automata.createdAt,
    };

    return created(response);
  } catch (error) {
    console.error('Error creating automata:', error);
    return internalError('Failed to create automata');
  }
}

/**
 * GET /realms/{realmId}/automatas
 * List automatas in a realm
 *
 * Permission: realm:{realmId}:read
 */
export async function handleListAutomatas(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const realmId = event.pathParameters?.realmId;

  if (!realmId) {
    return badRequest('Missing realmId path parameter');
  }

  // Check permission
  if (!auth.permissions.canReadRealm(realmId)) {
    return forbidden('Insufficient permissions to list automatas in this realm');
  }

  // Parse pagination params
  const limit = Math.min(
    Number.parseInt(event.queryStringParameters?.limit ?? '100', 10),
    1000
  );
  const cursor = event.queryStringParameters?.cursor;

  try {
    const result = await listAutomatasInRealm(auth.token.tenantId, realmId, {
      limit,
      cursor,
    });

    const response: ListAutomatasResponse = {
      automatas: result.automatas,
      nextCursor: result.nextCursor,
    };

    return ok(response);
  } catch (error) {
    console.error('Error listing automatas:', error);
    return internalError('Failed to list automatas');
  }
}

/**
 * GET /automatas/{automataId}/state
 * Get automata current state
 *
 * Permission: realm:{realmId}:read or automata:{automataId}:read
 */
export async function handleGetState(
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

    // Check permission (realm or automata level)
    if (
      !auth.permissions.canReadAutomata(automataId, automata.realmId)
    ) {
      return forbidden('Insufficient permissions to read automata state');
    }

    const response: AutomataStateResponse = {
      automataId: automata.automataId,
      currentState: automata.currentState,
      version: automata.version,
      status: automata.status,
      updatedAt: automata.updatedAt,
    };

    return ok(response);
  } catch (error) {
    console.error('Error getting automata state:', error);
    return internalError('Failed to get automata state');
  }
}

/**
 * GET /automatas/{automataId}/descriptor
 * Get automata descriptor and creation info
 *
 * Permission: realm:{realmId}:read or automata:{automataId}:read
 */
export async function handleGetDescriptor(
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
      return forbidden('Insufficient permissions to read automata descriptor');
    }

    const response: AutomataDescriptorResponse = {
      automataId: automata.automataId,
      tenantId: automata.tenantId,
      realmId: automata.realmId,
      descriptor: automata.descriptor,
      descriptorHash: automata.descriptorHash,
      creatorSubjectId: automata.creatorSubjectId,
      createdAt: automata.createdAt,
    };

    return ok(response);
  } catch (error) {
    console.error('Error getting automata descriptor:', error);
    return internalError('Failed to get automata descriptor');
  }
}

/**
 * PATCH /automatas/{automataId}
 * Update automata (archive)
 *
 * Permission: realm:{realmId}:readwrite or automata:{automataId}:readwrite
 */
export async function handleUpdateAutomata(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const automataId = event.pathParameters?.automataId;

  if (!automataId) {
    return badRequest('Missing automataId path parameter');
  }

  // Parse request body
  let request: UpdateAutomataRequest;
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }
    request = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate update fields
  if (request.status !== undefined && request.status !== 'archived') {
    return badRequest('status can only be set to "archived"');
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
      return forbidden('Insufficient permissions to update automata');
    }

    // Archive automata
    if (request.status === 'archived') {
      const result = await archiveAutomata(automataId);

      if (!result) {
        return notFound('Automata not found');
      }

      const response: UpdateAutomataResponse = {
        automataId,
        status: 'archived',
        updatedAt: result.updatedAt,
      };

      return ok(response);
    }

    // No update to perform
    return ok({
      automataId,
      status: automata.status,
      updatedAt: automata.updatedAt,
    });
  } catch (error) {
    console.error('Error updating automata:', error);
    return internalError('Failed to update automata');
  }
}
