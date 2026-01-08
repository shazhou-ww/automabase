/**
 * Replay Attack Protection
 * Based on BUSINESS_MODEL_SPEC.md Section 4.3
 */

import { AuthError } from '../errors/auth-error';

/**
 * Maximum allowed time difference between request timestamp and server time (5 minutes)
 */
const MAX_TIMESTAMP_DIFF_SECONDS = 5 * 60;

/**
 * Validate request timestamp
 * Returns true if timestamp is valid (within 5 minutes of server time)
 */
export function validateRequestTimestamp(
  requestTimestamp: string,
  serverTime: Date = new Date()
): { valid: boolean; error?: string } {
  if (!requestTimestamp) {
    return { valid: false, error: 'Missing X-Request-Timestamp header' };
  }

  let requestTime: Date;
  try {
    requestTime = new Date(requestTimestamp);
    if (isNaN(requestTime.getTime())) {
      return { valid: false, error: 'Invalid timestamp format' };
    }
  } catch {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  // Calculate time difference in seconds
  const diffSeconds = Math.abs((serverTime.getTime() - requestTime.getTime()) / 1000);

  if (diffSeconds > MAX_TIMESTAMP_DIFF_SECONDS) {
    return {
      valid: false,
      error: `Request timestamp is too old or too far in the future. Difference: ${Math.round(diffSeconds)}s, max allowed: ${MAX_TIMESTAMP_DIFF_SECONDS}s`,
    };
  }

  return { valid: true };
}

/**
 * Validate request ID format (should be ULID)
 */
export function validateRequestIdFormat(requestId: string): { valid: boolean; error?: string } {
  if (!requestId) {
    return { valid: false, error: 'Missing X-Request-Id header' };
  }

  // ULID format: 26 characters, base32 encoded
  // Pattern: 0-9, A-Z (excluding I, L, O, U)
  const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

  if (!ulidPattern.test(requestId)) {
    return { valid: false, error: 'Invalid Request ID format (expected ULID)' };
  }

  return { valid: true };
}

