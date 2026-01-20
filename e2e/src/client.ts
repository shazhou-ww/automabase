/**
 * E2E Test API Client
 *
 * Re-exports from @automabase/automata-client with E2E-specific configuration.
 */

import { createClient as _createClient, type AutomataClient } from '@automabase/automata-client';
import { createCryptoProvider } from '@automabase/crypto-provider-nodejs';
import { config } from './config';
import { getTestTokenAsync } from './helpers';

// Re-export types and utilities from automata-client
export {
  type ApiResponse,
  AutomataClient as ApiClient,
  type RequestOptions,
} from '@automabase/automata-client';

/**
 * Create a new API client instance configured for E2E tests
 *
 * This helper function:
 * 1. Gets a test token
 * 2. Creates an account if needed to get accountId
 * 3. Creates a client with automatic key management using Node.js provider
 *
 * @param accountId - Optional account ID. If not provided, will create a new account first.
 * @param baseUrl - Optional base URL override
 * @returns Promise resolving to configured client
 */
export async function createClient(accountId?: string, baseUrl?: string): Promise<AutomataClient> {
  const token = await getTestTokenAsync();
  const apiBaseUrl = baseUrl || config.apiBaseUrl;
  const cryptoProvider = createCryptoProvider();

  // If accountId is provided, create client directly
  if (accountId) {
    return _createClient({
      baseUrl: apiBaseUrl,
      accountId,
      cryptoProvider,
      token,
      deviceName: 'E2E Test Device',
      onDeviceReady: async (publicKey, deviceName) => {
        // Register device with server
        // Note: We need to create a client without onDeviceReady to avoid recursion
        const registerClient = await _createClient({
          baseUrl: apiBaseUrl,
          accountId,
          cryptoProvider,
          token,
          // No onDeviceReady to avoid recursion
        });
        await registerClient.registerDevice(publicKey, deviceName, 'browser');
      },
    });
  }

  // No accountId provided - need to create account first
  // Use a temporary accountId to bootstrap
  const tempAccountId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const tempClient = await _createClient({
    baseUrl: apiBaseUrl,
    accountId: tempAccountId,
    cryptoProvider,
    token,
    deviceName: 'E2E Test Device',
    onDeviceReady: async () => {
      // Will be called but we'll handle account creation separately
    },
  });

  // Create account to get real accountId
  const accountResponse = await tempClient.createAccount({
    deviceName: 'E2E Test Device',
  });

  if (!accountResponse.data?.account) {
    throw new Error('Failed to create account for E2E test');
  }

  const realAccountId = accountResponse.data.account.accountId;

  // Now create the actual client with the real accountId
  // The key will be loaded from storage (or created if this is first time)
  return _createClient({
    baseUrl: apiBaseUrl,
    accountId: realAccountId,
    cryptoProvider,
    token,
    deviceName: 'E2E Test Device',
    onDeviceReady: async (publicKey, deviceName) => {
      // Register device with server
      // Note: We need to create a client without onDeviceReady to avoid recursion
      const registerClient = await _createClient({
        baseUrl: apiBaseUrl,
        accountId: realAccountId,
        cryptoProvider,
        token,
        // No onDeviceReady to avoid recursion
      });
      await registerClient.registerDevice(publicKey, deviceName, 'browser');
    },
  });
}

/**
 * Create a client with an existing account
 *
 * Use this when you already have an accountId and want to create a client.
 *
 * @param accountId - Account ID
 * @param baseUrl - Optional base URL override
 * @returns Promise resolving to configured client
 */
export async function createClientWithAccount(
  accountId: string,
  baseUrl?: string
): Promise<AutomataClient> {
  return createClient(accountId, baseUrl);
}
