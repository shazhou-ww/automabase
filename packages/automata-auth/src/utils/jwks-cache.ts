import * as jose from 'jose';
import type { JwtConfig } from '../types/auth-types';

// JWKS cache per URI
const jwksCache = new Map<string, { jwks: jose.JWTVerifyGetKey; expiresAt: number }>();

/**
 * Get or create JWKS remote key set with caching
 */
export function getJwks(config: JwtConfig): jose.JWTVerifyGetKey {
  const cacheKey = config.jwksUri;
  const cacheDuration = config.jwksCacheDuration ?? 600000; // 10 minutes default
  const now = Date.now();

  const cached = jwksCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.jwks;
  }

  const jwks = jose.createRemoteJWKSet(new URL(config.jwksUri));
  jwksCache.set(cacheKey, { jwks, expiresAt: now + cacheDuration });
  return jwks;
}

/**
 * Clear the JWKS cache (useful for testing or key rotation)
 */
export function clearJwksCache(): void {
  jwksCache.clear();
}