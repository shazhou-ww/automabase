/**
 * Authentication error codes
 */
export type AuthErrorCode =
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'MISSING_CLAIMS'
  | 'MISSING_TOKEN'
  | 'JWKS_ERROR'
  | 'FORBIDDEN';

/**
 * Authentication error
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode
  ) {
    super(message);
    this.name = 'AuthError';
  }
}