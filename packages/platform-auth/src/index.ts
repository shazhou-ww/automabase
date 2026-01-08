/**
 * Platform Authentication for Automabase
 *
 * Provides API Key authentication for admin APIs using AWS Secrets Manager.
 * Designed with extensibility for future PaaS user account authentication.
 */

// Re-export types
export type {
  AdminApiKeySecret,
  PlatformAuthContext,
  PlatformAuthResult,
  PlatformAuthError,
  PlatformAuthErrorCode,
  PlatformAuthConfig,
  PlatformAuthProvider,
} from './types/platform-types';

// Re-export Secrets Manager utilities
export {
  getAdminApiKey,
  invalidateSecretCache,
  resetSecretsClient,
} from './utils/secrets-manager';

// Re-export API Key verification
export {
  parseApiKeyHeader,
  verifyApiKey,
  createApiKeyAuthProvider,
} from './utils/api-key-verifier';

// Re-export middleware
export {
  extractApiKeyHeader,
  authenticateRequest,
  createPlatformAuthMiddleware,
  type AuthMiddlewareResult,
} from './utils/middleware';

