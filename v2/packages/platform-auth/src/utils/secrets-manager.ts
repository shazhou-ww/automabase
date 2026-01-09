/**
 * AWS Secrets Manager utilities for platform authentication
 */

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { AdminApiKeySecret } from '../types/platform-types';

// Default secret name
const DEFAULT_SECRET_NAME = 'automabase/admin-api-key';

// Cache for the secret value
let cachedSecret: AdminApiKeySecret | null = null;
let cacheExpiresAt = 0;
let secretsClient: SecretsManagerClient | null = null;

/**
 * Get or create the Secrets Manager client
 */
function getClient(region?: string): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient(region ? { region } : {});
  }
  return secretsClient;
}

/**
 * Fetch admin API key from AWS Secrets Manager
 * @param secretName The secret name in Secrets Manager
 * @param region Optional AWS region
 * @param cacheTtlSeconds Cache TTL in seconds (default: 300)
 * @returns The admin API key secret
 */
export async function getAdminApiKey(
  secretName: string = DEFAULT_SECRET_NAME,
  region?: string,
  cacheTtlSeconds = 300
): Promise<AdminApiKeySecret> {
  const now = Date.now();

  // Return cached value if valid
  if (cachedSecret && now < cacheExpiresAt) {
    return cachedSecret;
  }

  const client = getClient(region);

  const command = new GetSecretValueCommand({
    SecretId: secretName,
  });

  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret ${secretName} has no string value`);
  }

  let secret: AdminApiKeySecret;
  try {
    secret = JSON.parse(response.SecretString);
  } catch {
    throw new Error(`Secret ${secretName} is not valid JSON`);
  }

  // Validate secret structure
  if (!secret.keyId || typeof secret.keyId !== 'string') {
    throw new Error(`Secret ${secretName} missing or invalid 'keyId'`);
  }
  if (!secret.secret || typeof secret.secret !== 'string') {
    throw new Error(`Secret ${secretName} missing or invalid 'secret'`);
  }

  // Update cache
  cachedSecret = secret;
  cacheExpiresAt = now + cacheTtlSeconds * 1000;

  return secret;
}

/**
 * Invalidate the cached secret
 * Call this when you need to force a refresh (e.g., after key rotation)
 */
export function invalidateSecretCache(): void {
  cachedSecret = null;
  cacheExpiresAt = 0;
}

/**
 * Reset the Secrets Manager client (for testing)
 */
export function resetSecretsClient(): void {
  secretsClient = null;
  invalidateSecretCache();
}
