/**
 * Signature Middleware - Validates request signatures and replay protection
 * Based on BUSINESS_MODEL_SPEC.md Section 4.2 and 4.3
 */

import { checkAndRecordRequestId } from '@automabase/automata-core';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { AuthError } from '../errors/auth-error';
import type { VerifiedAutomabaseToken } from '../types/auth-types';
import { validateRequestIdFormat, validateRequestTimestamp } from './replay-protection';
import { verifyRequestSignatureFromEvent } from './request-signature';

/**
 * Extract headers from API Gateway event
 */
function extractHeader(event: APIGatewayProxyEvent, name: string): string | undefined {
  const headers = event.headers || {};
  const multiValueHeaders = event.multiValueHeaders || {};

  // Check both single and multi-value headers (case-insensitive)
  const nameLower = name.toLowerCase();

  // Try single value headers first
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === nameLower && value) {
      return value;
    }
  }

  // Try multi-value headers
  for (const [key, values] of Object.entries(multiValueHeaders)) {
    if (key.toLowerCase() === nameLower && values && values.length > 0) {
      return values[0];
    }
  }

  return undefined;
}

/**
 * Verify request signature and replay protection
 * This middleware should be called after JWT authentication
 */
export async function verifyRequestSignatureAndReplay(
  event: APIGatewayProxyEvent,
  token: VerifiedAutomabaseToken
): Promise<{ valid: boolean; error?: AuthError }> {
  // Extract required headers
  const requestId = extractHeader(event, 'X-Request-Id');
  const requestTimestamp = extractHeader(event, 'X-Request-Timestamp');
  const requestSignature = extractHeader(event, 'X-Request-Signature');

  // Validate request ID format
  if (!requestId) {
    return { valid: false, error: new AuthError('Missing X-Request-Id header', 'MISSING_HEADER') };
  }

  const formatCheck = validateRequestIdFormat(requestId);
  if (!formatCheck.valid) {
    return {
      valid: false,
      error: new AuthError(formatCheck.error || 'Invalid Request ID format', 'INVALID_HEADER'),
    };
  }

  // Validate timestamp
  if (!requestTimestamp) {
    return {
      valid: false,
      error: new AuthError('Missing X-Request-Timestamp header', 'MISSING_HEADER'),
    };
  }

  const timestampCheck = validateRequestTimestamp(requestTimestamp);
  if (!timestampCheck.valid) {
    return {
      valid: false,
      error: new AuthError(timestampCheck.error || 'Invalid timestamp', 'INVALID_HEADER'),
    };
  }

  // Check for duplicate request ID (replay protection)
  try {
    const isNew = await checkAndRecordRequestId(requestId);
    if (!isNew) {
      return {
        valid: false,
        error: new AuthError('Duplicate Request ID (possible replay attack)', 'REPLAY_ATTACK'),
      };
    }
  } catch (error) {
    console.error('Error checking request ID:', error);
    return {
      valid: false,
      error: new AuthError('Failed to verify request ID', 'INTERNAL_ERROR'),
    };
  }

  // Verify request signature
  if (!requestSignature) {
    return {
      valid: false,
      error: new AuthError('Missing X-Request-Signature header', 'MISSING_HEADER'),
    };
  }

  const signatureCheck = await verifyRequestSignatureFromEvent(event, token.sessionPublicKey);
  if (!signatureCheck.valid) {
    return {
      valid: false,
      error: new AuthError(
        signatureCheck.error || 'Invalid request signature',
        'INVALID_SIGNATURE'
      ),
    };
  }

  return { valid: true };
}
