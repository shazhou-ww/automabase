/**
 * E2E Test Configuration
 */

export const config = {
  /** Base URL for the API (SAM Local) */
  baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',

  /** Admin API Key for tenant management */
  adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin:dev-secret-change-me',

  /** Request timeout in milliseconds */
  timeout: 10000,
};

/**
 * Build headers for admin API requests
 */
export function adminHeaders(): Record<string, string> {
  return {
    'X-Admin-Key': config.adminApiKey,
    'Content-Type': 'application/json',
  };
}
