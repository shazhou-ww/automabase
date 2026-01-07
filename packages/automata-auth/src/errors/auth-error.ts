/**
 * Authentication error
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_CLAIMS' | 'JWKS_ERROR'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}