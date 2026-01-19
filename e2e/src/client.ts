/**
 * E2E Test API Client
 *
 * Re-exports from @automabase/automata-client with E2E-specific configuration.
 */

import {
  generateKeyPair as _generateKeyPair,
  signData as _signData,
  AutomataClient,
} from '@automabase/automata-client';
import { config } from './config';

// Re-export types and utilities from automata-client
// Re-export with alias for backward compatibility
export {
  type ApiResponse,
  AutomataClient as ApiClient,
  type RequestOptions,
} from '@automabase/automata-client';

/**
 * Create a new API client instance configured for E2E tests
 */
export function createClient(baseUrl?: string): AutomataClient {
  return new AutomataClient({ baseUrl: baseUrl || config.apiBaseUrl });
}

// Keep backward compatibility - re-export generateKeyPair
export const generateKeyPair = _generateKeyPair;
export const signData = _signData;
