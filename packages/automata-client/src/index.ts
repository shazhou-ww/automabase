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
 * // Create account and register device
 * const { data } = await client.createAccount({
 *   publicKey: keyPair.publicKey,
 *   deviceName: 'My Browser',
 * });
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
export {
  base64UrlDecode,
  base64UrlEncode,
  generateKeyPair,
  signData,
  verifySignature,
} from './crypto';

// Request signing
export {
  buildCanonicalRequest,
  generateRequestId,
  generateRequestTimestamp,
  signRequest,
} from './signing';

// Types
export type {
  // Entities
  Account,
  AccountStatus,
  ApiErrorResponse,
  ApiResponse,
  ArchiveAutomataResponse,
  Automata,
  AutomataEvent,
  AutomataStatus,
  ClientConfig,
  CreateAccountResponse,
  CreateAutomataResponse,
  Device,
  DeviceStatus,
  DeviceType,
  GetAccountResponse,
  GetAutomataResponse,
  GetAutomataStateResponse,
  GetEventResponse,
  // API Response types
  GetMeResponse,
  GetWsTokenResponse,
  HttpMethod,
  ListAutomatasOptions,
  ListAutomatasResponse,
  ListDevicesResponse,
  ListEventsOptions,
  ListEventsResponse,
  // Common types
  OAuthProvider,
  RegisterDeviceResponse,
  // Request/Response types
  RequestOptions,
  RevokeDeviceResponse,
  SendEventResponse,
  UnarchiveAutomataResponse,
  UpdateAccountResponse,
} from './types';
