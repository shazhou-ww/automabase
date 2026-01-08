/**
 * Request ID Repository - DynamoDB operations for Request ID deduplication
 * Based on BUSINESS_MODEL_SPEC.md Section 6.4
 */

import {
  GetCommand,
  type GetCommandInput,
  PutCommand,
  type PutCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { getDocClient } from './client';
import { REQUEST_ID_TABLE, REQUEST_ID_TTL_SECONDS } from './constants';

/**
 * Check if request ID exists (and record it if not)
 * Returns true if request ID is new (not seen before), false if duplicate
 */
export async function checkAndRecordRequestId(requestId: string): Promise<boolean> {
  const docClient = getDocClient();

  // Calculate TTL (current time + TTL seconds)
  const ttl = Math.floor(Date.now() / 1000) + REQUEST_ID_TTL_SECONDS;

  try {
    // Try to get existing request ID
    const getInput: GetCommandInput = {
      TableName: REQUEST_ID_TABLE,
      Key: {
        requestId,
      },
    };

    const getResult = await docClient.send(new GetCommand(getInput));

    // If request ID exists, it's a duplicate
    if (getResult.Item) {
      return false;
    }

    // Record the request ID with TTL
    const putInput: PutCommandInput = {
      TableName: REQUEST_ID_TABLE,
      Item: {
        requestId,
        ttl,
      },
      // Use conditional put to handle race conditions
      ConditionExpression: 'attribute_not_exists(requestId)',
    };

    await docClient.send(new PutCommand(putInput));

    // Successfully recorded new request ID
    return true;
  } catch (error: unknown) {
    // If it's a conditional check failure, the request ID was already recorded
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      return false;
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Check if request ID exists without recording it
 * Useful for read-only checks
 */
export async function hasRequestId(requestId: string): Promise<boolean> {
  const docClient = getDocClient();

  const getInput: GetCommandInput = {
    TableName: REQUEST_ID_TABLE,
    Key: {
      requestId,
    },
  };

  const result = await docClient.send(new GetCommand(getInput));
  return !!result.Item;
}
