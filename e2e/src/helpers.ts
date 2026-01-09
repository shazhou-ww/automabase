/**
 * E2E Test Helpers
 *
 * Common utilities for testing
 */

import { config } from './config';

/**
 * Generate a mock JWT token for local testing
 * Only works when LOCAL_DEV_MODE is enabled on the server
 */
export function generateLocalDevToken(accountId?: string): string {
  // When LOCAL_DEV_MODE is enabled, the server accepts any Bearer token
  // and uses a default account ID from the config
  const payload = {
    sub: 'local-dev-user',
    email: 'test@example.com',
    name: 'Test User',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  // Simple base64 encoding (not a real JWT, but works for local dev)
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');

  return `${header}.${body}.`;
}

/**
 * Get a valid auth token for testing
 *
 * For local testing: generates a mock token (requires LOCAL_DEV_MODE=true)
 * For production: requires COGNITO_TOKEN environment variable
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
 */
export const APP_REGISTRY_BLUEPRINT = {
  appId: 'SYSTEM',
  name: 'AppRegistry',
  description: 'System builtin blueprint for app registration',

  stateSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: 100 },
      description: { type: 'string', maxLength: 1000 },
      iconUrl: { type: 'string', format: 'uri' },
      websiteUrl: { type: 'string', format: 'uri' },
      status: { enum: ['draft', 'published', 'archived'] },
    },
    required: ['name', 'status'],
    additionalProperties: false,
  },

  eventSchemas: {
    SET_INFO: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100 },
        description: { type: 'string', maxLength: 1000 },
        iconUrl: { type: 'string', format: 'uri' },
        websiteUrl: { type: 'string', format: 'uri' },
      },
      additionalProperties: false,
    },
    PUBLISH: { type: 'object', additionalProperties: false },
    UNPUBLISH: { type: 'object', additionalProperties: false },
    ARCHIVE: { type: 'object', additionalProperties: false },
  },

  initialState: {
    name: 'Untitled App',
    status: 'draft',
  },

  transition: `
    $event.type = 'SET_INFO' ? $merge([$state, $event.data]) :
    $event.type = 'PUBLISH' ? $merge([$state, { "status": "published" }]) :
    $event.type = 'UNPUBLISH' ? $merge([$state, { "status": "draft" }]) :
    $event.type = 'ARCHIVE' ? $merge([$state, { "status": "archived" }]) :
    $state
  `,
};

