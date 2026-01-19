/**
 * E2E Test Configuration
 *
 * Supports testing against local (sam local) or deployed endpoints
 */

export interface E2EConfig {
  /** API Base URL */
  apiBaseUrl: string;

  /** Cognito User Pool ID */
  userPoolId: string;

  /** Cognito Client ID */
  clientId: string;

  /** Cognito Hosted UI URL */
  cognitoUrl: string;

  /** AWS Region */
  region: string;

  /** Whether running against local environment */
  isLocal: boolean;
}

/**
 * Get E2E configuration from environment variables
 */
export function getConfig(): E2EConfig {
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3201';
  const isLocal = apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1');

  return {
    apiBaseUrl,
    userPoolId: process.env.COGNITO_USER_POOL_ID || 'ap-southeast-2_2cTIVAhYG',
    clientId: process.env.COGNITO_CLIENT_ID || '6rjt3vskji08mdscm6pqloppmn',
    cognitoUrl:
      process.env.COGNITO_URL ||
      'https://automabase-dev-914369185440.auth.ap-southeast-2.amazoncognito.com',
    region: process.env.AWS_REGION || 'ap-southeast-2',
    isLocal,
  };
}

export const config = getConfig();
