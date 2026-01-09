/**
 * Token Manager
 * Handles automatic token refresh and validation
 */

import { getProfile, updateProfileCredentials } from '../config/profile-manager';
import type { Credentials } from '../config/types';
import { refreshToken } from './oauth-device';

const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if token is expired or about to expire
 */
export function isTokenExpired(credentials: Credentials, thresholdMs = 0): boolean {
  const expiresAt = new Date(credentials.expiresAt);
  const now = new Date();
  return expiresAt.getTime() - thresholdMs <= now.getTime();
}

/**
 * Get a valid access token for a profile
 * Will automatically refresh if needed
 */
export async function getValidToken(profileName: string): Promise<string | null> {
  const profile = getProfile(profileName);

  if (!profile) {
    return null;
  }

  if (!profile.credentials) {
    return null;
  }

  // Check if token is still valid
  if (!isTokenExpired(profile.credentials, TOKEN_REFRESH_THRESHOLD_MS)) {
    return profile.credentials.accessToken;
  }

  // Token is expired or about to expire, try to refresh
  if (!profile.credentials.refreshToken) {
    return null;
  }

  try {
    const newCredentials = await refreshToken(profile.oauth, profile.credentials.refreshToken);

    // Save new credentials
    updateProfileCredentials(profileName, newCredentials);

    return newCredentials.accessToken;
  } catch {
    // Refresh failed, clear credentials
    updateProfileCredentials(profileName, null);
    return null;
  }
}

/**
 * Create an authorization header value
 */
export async function getAuthorizationHeader(profileName: string): Promise<string | null> {
  const token = await getValidToken(profileName);
  if (!token) {
    return null;
  }
  return `Bearer ${token}`;
}
