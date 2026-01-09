/**
 * Platform Authentication for Automabase
 *
 * Provides API Key authentication for admin APIs using AWS Secrets Manager.
 * Designed with extensibility for future PaaS user account authentication.
 */

// Re-export types
export type {
  AdminApiKeySecret,
  PlatformAuthConfig,
  PlatformAuthContext,
  PlatformAuthError,
  PlatformAuthErrorCode,
  PlatformAuthProvider,
  PlatformAuthResult,
} from './types/platform-types';
// Re-export API Key verification
export {
  createApiKeyAuthProvider,
  parseApiKeyHeader,
  verifyApiKey,
} from './utils/api-key-verifier';
// Re-export middleware
export {
  type AuthMiddlewareResult,
  authenticateRequest,
  createPlatformAuthMiddleware,
  extractApiKeyHeader,
} from './utils/middleware';
// Re-export Secrets Manager utilities
export {
  getAdminApiKey,
  invalidateSecretCache,
  resetSecretsClient,
} from './utils/secrets-manager';
