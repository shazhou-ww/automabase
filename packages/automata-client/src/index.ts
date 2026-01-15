/**
 * @automabase/automata-client
 *
 * Type-safe client library for interacting with the Automabase API.
 *
 * @example
 * ```typescript
 * import { AutomataClient, generateKeyPair } from '@automabase/automata-client';
 *
 * // Create client
 * const client = new AutomataClient({ baseUrl: 'https://api.automabase.io' });
 *
 * // Generate key pair for signing
 * const keyPair = await generateKeyPair();
 *
 * // Configure client
 * client
 *   .setToken(jwtToken)
 *   .setPrivateKey(keyPair.privateKey);
 *
 * // Create account
 * const { data } = await client.createAccount(keyPair.publicKey);
 * client.setAccountId(data.account.accountId);
 *
 * // Create automata
 * const automata = await client.createAutomata(myBlueprint);
 *
 * // Send events
 * await client.sendEvent(automata.data.automataId, 'myEvent', { payload: 'data' });
 * ```
 *
 * @packageDocumentation
 */

// Client
export { AutomataClient, createClient } from './client';

// Cryptographic utilities
export { generateKeyPair, signData, verifySignature, base64UrlEncode, base64UrlDecode } from './crypto';

// Request signing
export { signRequest, buildCanonicalRequest, generateRequestId, generateRequestTimestamp } from './signing';

// Types
export type {
  // Common types
  OAuthProvider,
  AccountStatus,
  AutomataStatus,
  HttpMethod,

  // Entities
  Account,
  Automata,
  AutomataEvent,

  // Request/Response types
  RequestOptions,
  ApiResponse,
  ClientConfig,
  ListAutomatasOptions,
  ListEventsOptions,

  // API Response types
  GetMeResponse,
  CreateAccountResponse,
  UpdateAccountResponse,
  GetAccountResponse,
  CreateAutomataResponse,
  ListAutomatasResponse,
  GetAutomataResponse,
  GetAutomataStateResponse,
  ArchiveAutomataResponse,
  UnarchiveAutomataResponse,
  SendEventResponse,
  ListEventsResponse,
  GetEventResponse,
  GetWsTokenResponse,
  ApiErrorResponse,
} from './types';
