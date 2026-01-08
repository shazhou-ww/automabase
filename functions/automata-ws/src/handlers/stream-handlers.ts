/**
 * DynamoDB Stream Handler for broadcasting state updates
 * Based on BUSINESS_MODEL_SPEC.md Section 5.6
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { getSubscribersForAutomata, sendToConnection } from '../utils/connections';

/**
 * State update message format
 */
interface StateUpdateMessage {
  type: 'state';
  automataId: string;
  eventId: string;
  event: {
    type: string;
    data: unknown;
  };
  state: unknown;
  version: string;
  timestamp: string;
}

/**
 * Handle DynamoDB Stream events
 * Broadcasts state updates to subscribed connections
 */
export async function handleStreamEvent(event: DynamoDBStreamEvent): Promise<void> {
  console.log('Stream event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error('Error processing record:', error);
      // Continue processing other records
    }
  }
}

/**
 * Process a single DynamoDB stream record
 */
async function processRecord(record: DynamoDBRecord): Promise<void> {
  // Only process INSERT events (new events)
  if (record.eventName !== 'INSERT') {
    return;
  }

  const newImage = record.dynamodb?.NewImage;
  if (!newImage) {
    return;
  }

  // Unmarshall the DynamoDB item
  const item = unmarshall(newImage as Record<string, AttributeValue>);

  // Check if this is an event record (SK starts with EVT#)
  if (!item.sk || !item.sk.startsWith('EVT#')) {
    return;
  }

  const automataId = item.automataId;
  if (!automataId) {
    return;
  }

  console.log('Processing event for automata:', automataId);

  // Get all subscribers for this automata
  const subscribers = await getSubscribersForAutomata(automataId);

  if (subscribers.length === 0) {
    console.log('No subscribers for automata:', automataId);
    return;
  }

  console.log(`Broadcasting to ${subscribers.length} subscribers`);

  // Build state update message
  const message: StateUpdateMessage = {
    type: 'state',
    automataId,
    eventId: `event:${automataId}:${item.baseVersion}`,
    event: {
      type: item.eventType,
      data: item.eventData,
    },
    state: item.nextState, // Note: This needs to be the new state after transition
    version: item.baseVersion, // Note: This is the base version, new version is baseVersion + 1
    timestamp: item.timestamp,
  };

  // Send to all subscribers in parallel
  const results = await Promise.allSettled(
    subscribers.map((connectionId) => sendToConnection(connectionId, message))
  );

  // Log results
  const successful = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;

  console.log(`Broadcast complete: ${successful} successful, ${failed} failed`);
}
