/**
 * E2E Test Helpers
 *
 * Common utilities for testing
 */

import * as crypto from 'node:crypto';
import { config } from './config';

/**
 * Sign a JWT using Ed25519
 */
function signLocalJwt(
  payload: Record<string, unknown>,
  options: { privateKey: string; issuer: string; expiresIn: string }
): string {
  const header = { alg: 'EdDSA', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (options.expiresIn === '1h' ? 3600 : 3600);

  const claims = {
    ...payload,
    iss: options.issuer,
    iat: now,
    exp,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign(null, Buffer.from(message), {
    key: options.privateKey,
    format: 'pem',
  });
  const encodedSignature = signature.toString('base64url');

  return `${message}.${encodedSignature}`;
}

/**
 * Get local JWT configuration from environment
 *
 * Environment variables:
 * - LOCAL_JWT_PRIVATE_KEY: PEM-encoded Ed25519 private key
 * - LOCAL_JWT_PUBLIC_KEY: PEM-encoded Ed25519 public key (for verification on server)
 * - LOCAL_JWT_ISSUER: Optional issuer string (default: 'local-dev')
 *
 * If keys are not provided, a temporary key pair will be generated for this test run.
 * Note: When using generated keys, the server must also use the same public key.
 */
let cachedKeyPair: { privateKey: string; publicKey: string } | null = null;

function getLocalJwtKeys(): { privateKey: string; publicKey: string } {
  // First check if we have cached keys (from initializeLocalJwtKeys)
  if (cachedKeyPair) {
    return cachedKeyPair;
  }

  const privateKey = process.env.LOCAL_JWT_PRIVATE_KEY;
  const publicKey = process.env.LOCAL_JWT_PUBLIC_KEY;

  if (privateKey && publicKey) {
    cachedKeyPair = { privateKey, publicKey };
    return cachedKeyPair;
  }

  // No keys available - must call initializeLocalJwtKeys first
  throw new Error(
    'LOCAL_JWT_PRIVATE_KEY and LOCAL_JWT_PUBLIC_KEY must be set for E2E tests, ' +
      'or call initializeLocalJwtKeys() first to generate temporary keys. ' +
      'Run "bun run keygen" to generate persistent keys.'
  );
}

/**
 * Initialize key pair for E2E tests
 *
 * Requires LOCAL_JWT_PRIVATE_KEY and LOCAL_JWT_PUBLIC_KEY environment variables.
 * Run `bun run keygen` to generate and configure keys.
 */
export async function initializeLocalJwtKeys(): Promise<{ privateKey: string; publicKey: string }> {
  const privateKey = process.env.LOCAL_JWT_PRIVATE_KEY;
  const publicKey = process.env.LOCAL_JWT_PUBLIC_KEY;

  if (!privateKey || !publicKey) {
    throw new Error(
      '\n' +
        '❌ LOCAL_JWT_PRIVATE_KEY and LOCAL_JWT_PUBLIC_KEY must be configured for E2E tests.\n' +
        '\n' +
        '   To set up JWT keys:\n' +
        '   1. Run: bun run keygen\n' +
        '   2. Restart SAM local to pick up the new keys\n' +
        '   3. Set environment variables from env.json E2ETests section:\n' +
        '      export LOCAL_JWT_PRIVATE_KEY="..."\n' +
        '      export LOCAL_JWT_PUBLIC_KEY="..."\n' +
        '\n'
    );
  }

  cachedKeyPair = { privateKey, publicKey };
  console.log('[E2E] ✅ JWT keys configured for proper verification');
  return cachedKeyPair;
}

/**
 * Generate a properly signed local JWT token for testing
 *
 * This creates a real JWT signed with Ed25519, compatible with the server's
 * local JWT verification when LOCAL_JWT_PUBLIC_KEY is configured.
 */
export async function generateLocalDevTokenAsync(options?: {
  accountId?: string;
  email?: string;
  name?: string;
}): Promise<string> {
  // Ensure keys are initialized
  await initializeLocalJwtKeys();

  const keys = getLocalJwtKeys();
  const issuer = process.env.LOCAL_JWT_ISSUER || 'local-dev';

  return signLocalJwt(
    {
      sub: 'local-dev-user',
      email: options?.email || 'test@example.com',
      name: options?.name || 'Test User',
      'custom:account_id': options?.accountId,
    },
    {
      privateKey: keys.privateKey,
      issuer,
      expiresIn: '1h',
    }
  );
}

/**
 * Generate a mock JWT token for local testing (legacy, uses cached token)
 * @deprecated Use generateLocalDevTokenAsync for properly signed tokens
 */
export function generateLocalDevToken(_accountId?: string): string {
  // For backward compatibility, generate a simple mock token
  // This only works when the server doesn't have LOCAL_JWT_PUBLIC_KEY set
  const payload = {
    sub: 'local-dev-user',
    email: 'test@example.com',
    name: 'Test User',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

  return `${header}.${body}.`;
}

/**
 * Cached test token for the current session
 */
let cachedTestToken: string | null = null;

/**
 * Get a valid auth token for testing (async version)
 *
 * For local testing: generates a properly signed JWT (requires LOCAL_JWT_PRIVATE_KEY)
 * For production: requires COGNITO_TOKEN environment variable
 */
export async function getTestTokenAsync(): Promise<string> {
  if (config.isLocal) {
    if (!cachedTestToken) {
      cachedTestToken = await generateLocalDevTokenAsync();
    }
    return cachedTestToken;
  }

  const token = process.env.COGNITO_TOKEN;
  if (!token) {
    throw new Error(
      'COGNITO_TOKEN environment variable is required for production E2E tests.\n' +
        'Get a token by logging in at: ' +
        config.cognitoUrl +
        '/login?client_id=' +
        config.clientId +
        '&response_type=token&scope=openid+email+profile&redirect_uri=http://localhost:3000/callback'
    );
  }
  return token;
}

/**
 * Get a valid auth token for testing (sync version, legacy)
 *
 * For local testing: generates a mock token
 * For production: requires COGNITO_TOKEN environment variable
 *
 * @deprecated Use getTestTokenAsync for properly signed tokens
 */
export function getTestToken(): string {
  if (config.isLocal) {
    return generateLocalDevToken();
  }

  const token = process.env.COGNITO_TOKEN;
  if (!token) {
    throw new Error(
      'COGNITO_TOKEN environment variable is required for production E2E tests.\n' +
        'Get a token by logging in at: ' +
        config.cognitoUrl +
        '/login?client_id=' +
        config.clientId +
        '&response_type=token&scope=openid+email+profile&redirect_uri=http://localhost:3000/callback'
    );
  }
  return token;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; initialDelay?: number; maxDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000 } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delay);
        delay = Math.min(delay * 2, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * AppRegistry Blueprint for creating Apps
 * Must match exactly with packages/automata-core/src/services/builtin-blueprints.ts
 */
export const APP_REGISTRY_BLUEPRINT = {
  appId: 'SYSTEM',
  name: 'AppRegistry',
  description: 'System builtin blueprint for app registration',

  state: {
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100 },
        description: { type: 'string', maxLength: 1000 },
        iconUrl: { type: 'string', format: 'uri' },
        websiteUrl: { type: 'string', format: 'uri' },
        status: { enum: ['draft', 'published', 'archived'] },
      },
      required: ['name', 'status'],
    },
    initial: {
      name: 'Untitled App',
      status: 'draft',
    },
  },

  events: {
    SET_INFO: {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          iconUrl: { type: 'string', format: 'uri' },
          websiteUrl: { type: 'string', format: 'uri' },
        },
      },
      transition: '$merge([$.state, $.event])',
    },
    PUBLISH: {
      schema: { type: 'object' },
      transition: '$merge([$.state, { "status": "published" }])',
    },
    UNPUBLISH: {
      schema: { type: 'object' },
      transition: '$merge([$.state, { "status": "draft" }])',
    },
    ARCHIVE: {
      schema: { type: 'object' },
      transition: '$merge([$.state, { "status": "archived" }])',
    },
  },
};
