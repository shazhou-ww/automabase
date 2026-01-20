/**
 * @automabase/automata-client
 *
 * Type-safe, immutable client library for interacting with the Automabase API.
 * Uses WebCrypto API with ECDSA P-256 for request signing.
 * Automatically manages device keys in IndexedDB.
 *
 * @example
 * ```typescript
 * import { createClient } from '@automabase/automata-client';
 * import { createCryptoProvider } from '@automabase/crypto-provider-browser';
 *
 * // Create client with automatic key management
 * const client = await createClient({
 *   baseUrl: 'https://api.automabase.io',
 *   accountId: 'acc_123', // Required
 *   cryptoProvider: createCryptoProvider(), // Browser provider
 *   token: jwtToken,
 *   onDeviceReady: async (publicKey, deviceName) => {
 *     // Called when a new device key is created
 *     // Register the device with your server
 *     await fetch('/api/devices', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ publicKey, deviceName }),
 *     });
 *   },
 * });
 *
 * // Client is ready to use - keys are automatically loaded/created
 * const automata = await client.createAutomata(myBlueprint);
 * await client.sendEvent(automata.data.automataId, 'myEvent', { payload: 'data' });
 * ```
 *
 * @example
 * ```typescript
 * // Node.js environment
 * import { createClient } from '@automabase/automata-client';
 * import { createCryptoProvider } from '@automabase/crypto-provider-nodejs';
 *
 * const client = await createClient({
 *   baseUrl: 'https://api.automabase.io',
 *   accountId: 'acc_123',
 *   cryptoProvider: createCryptoProvider(), // Node.js provider
 *   token: jwtToken,
 * });
 * ```
 *
 * @packageDocumentation
 */

// Client
export { AutomataClient, createClient } from './client';

// Cryptographic utilities (internal use - keys are managed automatically)
export {
  base64UrlDecode,
  base64UrlEncode,
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
  CryptoProvider,
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
  TokenProvider,
  UnarchiveAutomataResponse,
  UpdateAccountResponse,
} from './types';
