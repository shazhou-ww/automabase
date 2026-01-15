/**
 * E2E Test API Client
 *
 * Re-exports from @automabase/automata-client with E2E-specific configuration.
 */

import {
  AutomataClient,
  generateKeyPair as _generateKeyPair,
  signData as _signData,
} from '@automabase/automata-client';
import { config } from './config';

// Re-export types and utilities from automata-client
export {
  type ApiResponse,
  type RequestOptions,
} from '@automabase/automata-client';

// Re-export with alias for backward compatibility
export { AutomataClient as ApiClient } from '@automabase/automata-client';

/**
 * Create a new API client instance configured for E2E tests
 */
export function createClient(baseUrl?: string): AutomataClient {
  return new AutomataClient({ baseUrl: baseUrl || config.apiBaseUrl });
}

// Keep backward compatibility - re-export generateKeyPair
export const generateKeyPair = _generateKeyPair;
export const signData = _signData;
