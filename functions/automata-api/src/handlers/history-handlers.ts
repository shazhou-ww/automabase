/**
 * History State API Handlers
 * Phase 3: Historical state query API
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getAutomata,
  getSnapshot,
  getLatestSnapshot,
  listSnapshots,
  listEvents,
  isValidVersion,
  versionToNumber,
  numberToVersion,
} from '@automabase/automata-core';
import type { AuthContext } from '../utils/auth-middleware';
import { ok, badRequest, forbidden, notFound, internalError } from '../utils/response-helpers';

/**
 * GET /automatas/{automataId}/history/{version}
 * Get historical state at a specific version
 *
 * Permission: realm:{realmId}:read or automata:{automataId}:read
 */
export async function handleGetHistoricalState(
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
      return forbidden('Insufficient permissions');
    }

    const currentVersionNum = versionToNumber(automata.version);
    const requestedVersionNum = versionToNumber(version);

    // Check if requested version is in the future
    if (requestedVersionNum > currentVersionNum) {
      return badRequest(`Version ${version} is in the future. Current version is ${automata.version}`);
    }

    // If requesting current version, return current state
    if (requestedVersionNum === currentVersionNum) {
      return ok({
        automataId,
        version,
        state: automata.currentState,
        isSnapshot: false,
        timestamp: automata.updatedAt,
      });
    }

    // Find the latest snapshot at or before the requested version
    const snapshot = await getLatestSnapshot(automataId, version);

    if (!snapshot) {
      // No snapshot found, need to replay from initial state
      // This is expensive, so we'll return an error suggesting to use a snapshot
      return badRequest(
        `No snapshot found for version ${version}. Historical state reconstruction from events is not yet supported.`
      );
    }

    const snapshotVersionNum = versionToNumber(snapshot.version);
    const requestedVersionNum2 = versionToNumber(version);

    // If snapshot is exactly at requested version, return it
    if (snapshotVersionNum === requestedVersionNum2) {
      return ok({
        automataId,
        version,
        state: snapshot.state,
        isSnapshot: true,
        timestamp: snapshot.createdAt,
      });
    }

    // Snapshot is before requested version, need to replay events
    // For now, return an error - full replay implementation would be complex
    return badRequest(
      `Snapshot found at version ${snapshot.version}, but replaying events to version ${version} is not yet supported.`
    );
  } catch (error) {
    console.error('Error getting historical state:', error);
    return internalError('Failed to get historical state');
  }
}

/**
 * GET /automatas/{automataId}/snapshots
 * List snapshots for an automata
 *
 * Permission: realm:{realmId}:read or automata:{automataId}:read
 */
export async function handleListSnapshots(
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
      return forbidden('Insufficient permissions');
    }

    // Parse query params
    const limit = Math.min(
      Number.parseInt(event.queryStringParameters?.limit ?? '100', 10),
      1000
    );
    const startVersion = event.queryStringParameters?.startVersion;

    if (startVersion && !isValidVersion(startVersion)) {
      return badRequest('Invalid startVersion format');
    }

    const snapshots = await listSnapshots(automataId, {
      limit,
      startVersion,
    });

    return ok({
      automataId,
      snapshots: snapshots.map((s) => ({
        version: s.version,
        state: s.state,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error listing snapshots:', error);
    return internalError('Failed to list snapshots');
  }
}

