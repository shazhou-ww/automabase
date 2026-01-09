/**
 * OAuth Device Code Flow Implementation
 * RFC 8628: https://tools.ietf.org/html/rfc8628
 */

import type { Credentials, OAuthConfig } from '../config/types';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

export interface DeviceAuthorizationResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

/**
 * Request device authorization
 */
export async function requestDeviceAuthorization(
  oauth: OAuthConfig
): Promise<DeviceAuthorizationResult> {
  const response = await fetch(oauth.deviceAuthEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      scope: oauth.scopes.join(' '),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Device authorization failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as DeviceCodeResponse;

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete,
    expiresIn: data.expires_in,
    interval: data.interval || 5,
  };
}

/**
 * Poll for token after user authorization
 */
export async function pollForToken(
  oauth: OAuthConfig,
  deviceCode: string,
  interval: number,
  expiresIn: number,
  onPending?: () => void
): Promise<Credentials> {
  const startTime = Date.now();
  const expiresAt = startTime + expiresIn * 1000;
  let pollInterval = interval * 1000;

  while (Date.now() < expiresAt) {
    await sleep(pollInterval);

    try {
      const response = await fetch(oauth.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: oauth.clientId,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as TokenResponse;
        const now = new Date();
        const tokenExpiresAt = new Date(now.getTime() + data.expires_in * 1000);

        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: tokenExpiresAt.toISOString(),
          tokenType: data.token_type,
        };
      }

      const errorData = (await response.json()) as TokenErrorResponse;

      switch (errorData.error) {
        case 'authorization_pending':
          onPending?.();
          continue;

        case 'slow_down':
          // Increase polling interval
          pollInterval += 5000;
          continue;

        case 'access_denied':
          throw new Error('Authorization was denied by the user');

        case 'expired_token':
          throw new Error('Device code has expired. Please try again.');

        default:
          throw new Error(
            errorData.error_description || `Token request failed: ${errorData.error}`
          );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Authorization')) {
        throw err;
      }
      // Network error, continue polling
      onPending?.();
    }
  }

  throw new Error('Device code has expired. Please try again.');
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshToken(
  oauth: OAuthConfig,
  currentRefreshToken: string
): Promise<Credentials> {
  const response = await fetch(oauth.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
      client_id: oauth.clientId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as TokenResponse;
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || currentRefreshToken,
    expiresAt: tokenExpiresAt.toISOString(),
    tokenType: data.token_type,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
