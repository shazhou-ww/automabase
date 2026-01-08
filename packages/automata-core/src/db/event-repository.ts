/**
 * Event Repository - DynamoDB operations for Event entity
 */

import {
  PutCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type PutCommandInput,
  type GetCommandInput,
  type QueryCommandInput,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';

import type { AutomataEvent, EventListItem, EventQueryDirection } from '../types/event';
import { createEventId } from '../types/event';
import { getDocClient } from './client';
import { TABLE_NAME, LSI, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants';
import { automataPK, eventSK, eventTypeSK, eventKeys, automataKeys } from './keys';
import { versionIncrement } from '../utils/base62';
import { shouldCreateSnapshot, createSnapshot } from './snapshot-repository';

/**
 * DynamoDB item structure for Event
 */
interface EventItem {
  pk: string;
  sk: string;
  automataId: string;
  baseVersion: string;
  eventType: string;
  eventData: unknown;
  senderSubjectId: string;
  timestamp: string;
  // LSI key
  lsi1sk: string;
}

/**
 * Convert DynamoDB item to Event entity
 */
function itemToEvent(item: EventItem): AutomataEvent {
  return {
    automataId: item.automataId,
    baseVersion: item.baseVersion,
    eventType: item.eventType,
    eventData: item.eventData,
    senderSubjectId: item.senderSubjectId,
    timestamp: item.timestamp,
  };
}

/**
 * Convert Event to list item
 */
function eventToListItem(event: AutomataEvent): EventListItem {
  return {
    eventId: createEventId(event.automataId, event.baseVersion),
    baseVersion: event.baseVersion,
    eventType: event.eventType,
    eventData: event.eventData,
    senderSubjectId: event.senderSubjectId,
    timestamp: event.timestamp,
  };
}

/**
 * Get an event by automata ID and version
 */
export async function getEvent(
  automataId: string,
  baseVersion: string
): Promise<AutomataEvent | null> {
  const docClient = getDocClient();

  const params: GetCommandInput = {
    TableName: TABLE_NAME,
    Key: eventKeys(automataId, baseVersion),
  };

  const result = await docClient.send(new GetCommand(params));

  if (!result.Item) {
    return null;
  }

  return itemToEvent(result.Item as EventItem);
}

/**
 * Create an event (simple put without transaction)
 */
export async function createEvent(event: AutomataEvent): Promise<void> {
  const docClient = getDocClient();

  const item: EventItem = {
    pk: automataPK(event.automataId),
    sk: eventSK(event.baseVersion),
    automataId: event.automataId,
    baseVersion: event.baseVersion,
    eventType: event.eventType,
    eventData: event.eventData,
    senderSubjectId: event.senderSubjectId,
    timestamp: event.timestamp,
    lsi1sk: eventTypeSK(event.eventType, event.baseVersion),
  };

  const params: PutCommandInput = {
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
  };

  await docClient.send(new PutCommand(params));
}

/**
 * Create event and update automata state atomically
 * Uses DynamoDB transactions for consistency
 */
export async function createEventWithStateUpdate(
  event: AutomataEvent,
  automataId: string,
  expectedVersion: string,
  newState: unknown
): Promise<{ success: boolean; newVersion: string }> {
  const docClient = getDocClient();
  const now = new Date().toISOString();
  const newVersion = versionIncrement(expectedVersion);

  const eventItem: EventItem = {
    pk: automataPK(automataId),
    sk: eventSK(event.baseVersion),
    automataId: event.automataId,
    baseVersion: event.baseVersion,
    eventType: event.eventType,
    eventData: event.eventData,
    senderSubjectId: event.senderSubjectId,
    timestamp: event.timestamp,
    lsi1sk: eventTypeSK(event.eventType, event.baseVersion),
  };

  const params: TransactWriteCommandInput = {
    TransactItems: [
      {
        // Put the event
        Put: {
          TableName: TABLE_NAME,
          Item: eventItem,
          ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
        },
      },
      {
        // Update automata state with optimistic locking
        Update: {
          TableName: TABLE_NAME,
          Key: automataKeys(automataId),
          UpdateExpression:
            'SET #currentState = :newState, #version = :newVersion, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#currentState': 'currentState',
            '#version': 'version',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':newState': newState,
            ':newVersion': newVersion,
            ':updatedAt': now,
            ':expectedVersion': expectedVersion,
          },
          ConditionExpression: 'attribute_exists(pk) AND #version = :expectedVersion',
        },
      },
    ],
  };

  try {
    await docClient.send(new TransactWriteCommand(params));
    
    // Create snapshot if needed (every 62 versions)
    // Do this after transaction succeeds to avoid blocking
    if (shouldCreateSnapshot(newVersion)) {
      try {
        await createSnapshot(automataId, newVersion, newState);
      } catch (snapshotError) {
        // Log but don't fail the event creation if snapshot fails
        console.error(`Failed to create snapshot for ${automataId} at version ${newVersion}:`, snapshotError);
      }
    }
    
    return { success: true, newVersion };
  } catch (error) {
    if (error instanceof TransactionCanceledException) {
      // Transaction failed - likely version conflict
      return { success: false, newVersion };
    }
    throw error;
  }
}

/**
 * List events for an automata
 */
export async function listEvents(
  automataId: string,
  options?: {
    direction?: EventQueryDirection;
    anchor?: string;
    limit?: number;
  }
): Promise<{ events: EventListItem[]; nextAnchor?: string }> {
  const docClient = getDocClient();
  const direction = options?.direction ?? 'backward';
  const limit = Math.min(options?.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const scanForward = direction === 'forward';

  const params: QueryCommandInput = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': automataPK(automataId),
      ':prefix': 'EVT#',
    },
    Limit: limit,
    ScanIndexForward: scanForward,
  };

  // Add anchor condition if provided
  if (options?.anchor) {
    if (direction === 'forward') {
      params.KeyConditionExpression = 'pk = :pk AND sk > :anchor';
      params.ExpressionAttributeValues![':anchor'] = eventSK(options.anchor);
    } else {
      params.KeyConditionExpression = 'pk = :pk AND sk < :anchor';
      params.ExpressionAttributeValues![':anchor'] = eventSK(options.anchor);
    }
  }

  const result = await docClient.send(new QueryCommand(params));

  const events: EventListItem[] = (result.Items ?? []).map((item) =>
    eventToListItem(itemToEvent(item as EventItem))
  );

  let nextAnchor: string | undefined;
  if (result.LastEvaluatedKey && events.length > 0) {
    nextAnchor = events[events.length - 1].baseVersion;
  }

  return { events, nextAnchor };
}

/**
 * List events by type using LSI
 */
export async function listEventsByType(
  automataId: string,
  eventType: string,
  options?: {
    direction?: EventQueryDirection;
    limit?: number;
  }
): Promise<{ events: EventListItem[]; nextAnchor?: string }> {
  const docClient = getDocClient();
  const direction = options?.direction ?? 'backward';
  const limit = Math.min(options?.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const scanForward = direction === 'forward';

  const params: QueryCommandInput = {
    TableName: TABLE_NAME,
    IndexName: LSI.EVENT_TYPE,
    KeyConditionExpression: 'pk = :pk AND begins_with(lsi1sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': automataPK(automataId),
      ':prefix': `EVTYPE#${eventType}#`,
    },
    Limit: limit,
    ScanIndexForward: scanForward,
  };

  const result = await docClient.send(new QueryCommand(params));

  const events: EventListItem[] = (result.Items ?? []).map((item) =>
    eventToListItem(itemToEvent(item as EventItem))
  );

  let nextAnchor: string | undefined;
  if (result.LastEvaluatedKey && events.length > 0) {
    nextAnchor = events[events.length - 1].baseVersion;
  }

  return { events, nextAnchor };
}
