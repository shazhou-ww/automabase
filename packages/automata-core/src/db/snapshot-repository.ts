/**
 * Snapshot Repository - DynamoDB operations for Snapshot entity
 * Snapshots are stored every 62 versions (Base62 increment)
 * Based on BUSINESS_MODEL_SPEC.md Section 6.1
 */

import {
  PutCommand,
  GetCommand,
  QueryCommand,
  type PutCommandInput,
  type GetCommandInput,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';

import { getDocClient } from './client';
import { TABLE_NAME } from './constants';
import { automataPK, snapshotSK, automataKeys } from './keys';
import { versionToNumber, numberToVersion } from '../utils/base62';

/**
 * Snapshot entity
 */
export interface Snapshot {
  automataId: string;
  version: string;
  state: unknown;
  createdAt: string;
}

/**
 * DynamoDB item structure for Snapshot
 */
interface SnapshotItem {
  pk: string;
  sk: string;
  automataId: string;
  version: string;
  state: unknown;
  createdAt: string;
}

/**
 * Convert DynamoDB item to Snapshot entity
 */
function itemToSnapshot(item: SnapshotItem): Snapshot {
  return {
    automataId: item.automataId,
    version: item.version,
    state: item.state,
    createdAt: item.createdAt,
  };
}

/**
 * Check if a version should have a snapshot (every 62 versions)
 * Snapshots are created at versions: 0, 62, 124, 186, ...
 */
export function shouldCreateSnapshot(version: string): boolean {
  const versionNum = versionToNumber(version);
  return versionNum % 62 === 0;
}

/**
 * Create a snapshot for an automata at a specific version
 */
export async function createSnapshot(
  automataId: string,
  version: string,
  state: unknown
): Promise<void> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  const item: SnapshotItem = {
    pk: automataPK(automataId),
    sk: snapshotSK(version),
    automataId,
    version,
    state,
    createdAt: now,
  };

  const params: PutCommandInput = {
    TableName: TABLE_NAME,
    Item: item,
    // Use conditional put to avoid overwriting existing snapshots
    ConditionExpression: 'attribute_not_exists(pk) OR attribute_not_exists(sk)',
  };

  try {
    await docClient.send(new PutCommand(params));
  } catch (error) {
    // Ignore if snapshot already exists
    console.log(`Snapshot already exists for ${automataId} at version ${version}`);
  }
}

/**
 * Get snapshot at a specific version
 */
export async function getSnapshot(
  automataId: string,
  version: string
): Promise<Snapshot | null> {
  const docClient = getDocClient();

  const params: GetCommandInput = {
    TableName: TABLE_NAME,
    Key: {
      pk: automataPK(automataId),
      sk: snapshotSK(version),
    },
  };

  const result = await docClient.send(new GetCommand(params));

  if (!result.Item) {
    return null;
  }

  return itemToSnapshot(result.Item as SnapshotItem);
}

/**
 * Get the latest snapshot before or at a given version
 */
export async function getLatestSnapshot(
  automataId: string,
  maxVersion: string
): Promise<Snapshot | null> {
  const docClient = getDocClient();
  const maxVersionNum = versionToNumber(maxVersion);

  // Find the largest snapshot version <= maxVersion
  // Snapshots are at versions: 0, 62, 124, 186, ...
  // So we need to find the largest multiple of 62 <= maxVersionNum
  const snapshotVersionNum = Math.floor(maxVersionNum / 62) * 62;
  const snapshotVersion = numberToVersion(snapshotVersionNum);

  return getSnapshot(automataId, snapshotVersion);
}

/**
 * List snapshots for an automata
 */
export async function listSnapshots(
  automataId: string,
  options?: {
    limit?: number;
    startVersion?: string;
  }
): Promise<Snapshot[]> {
  const docClient = getDocClient();
  const limit = Math.min(options?.limit ?? 100, 1000);

  const params: QueryCommandInput = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': automataPK(automataId),
      ':skPrefix': 'SNAP#',
    },
    ScanIndexForward: false, // Descending order (newest first)
    Limit: limit,
  };

  if (options?.startVersion) {
    params.ExclusiveStartKey = {
      pk: automataPK(automataId),
      sk: snapshotSK(options.startVersion),
    };
  }

  const result = await docClient.send(new QueryCommand(params));

  return (result.Items ?? []).map((item) => itemToSnapshot(item as SnapshotItem));
}

