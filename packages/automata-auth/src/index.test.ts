import { describe, expect, it } from 'vitest';
import {
  extractBearerToken,
  extractAuthContext,
  JwtVerificationError,
  type CognitoIdTokenClaims,
} from './index';

describe('extractBearerToken', () => {
  it('should extract token from valid header', () => {
    const token = extractBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.test');
    expect(token).toBe('eyJhbGciOiJIUzI1NiJ9.test');
  });

  it('should throw on missing header', () => {
    expect(() => extractBearerToken(undefined)).toThrow(JwtVerificationError);
    expect(() => extractBearerToken(undefined)).toThrow('Missing Authorization header');
  });

  it('should throw on invalid format', () => {
    expect(() => extractBearerToken('Basic abc123')).toThrow(JwtVerificationError);
    expect(() => extractBearerToken('Bearer')).toThrow(JwtVerificationError);
    expect(() => extractBearerToken('token')).toThrow(JwtVerificationError);
  });
});

describe('extractAuthContext', () => {
  it('should extract basic claims', () => {
    const claims: CognitoIdTokenClaims = {
      iss: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_xxx',
      sub: 'user-123',
      aud: 'client-id',
      exp: 9999999999,
      iat: 1000000000,
      token_use: 'id',
      auth_time: 1000000000,
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/avatar.jpg',
    };

    const context = extractAuthContext(claims);
    
    expect(context.cognitoUserId).toBe('user-123');
    expect(context.email).toBe('test@example.com');
    expect(context.displayName).toBe('Test User');
    expect(context.avatarUrl).toBe('https://example.com/avatar.jpg');
    expect(context.identityProvider).toBeUndefined();
  });

  it('should extract custom claims', () => {
    const claims: CognitoIdTokenClaims = {
      iss: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_xxx',
      sub: 'user-123',
      aud: 'client-id',
      exp: 9999999999,
      iat: 1000000000,
      token_use: 'id',
      auth_time: 1000000000,
      'custom:account_id': 'account-abc',
      'custom:spk': 'base64-public-key',
    };

    const context = extractAuthContext(claims);
    
    expect(context.accountId).toBe('account-abc');
    expect(context.sessionPublicKey).toBe('base64-public-key');
  });

  it('should extract identity provider info', () => {
    const claims: CognitoIdTokenClaims = {
      iss: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_xxx',
      sub: 'user-123',
      aud: 'client-id',
      exp: 9999999999,
      iat: 1000000000,
      token_use: 'id',
      auth_time: 1000000000,
      identities: [
        { providerName: 'Google', userId: 'google-user-id' },
      ],
    };

    const context = extractAuthContext(claims);
    
    expect(context.identityProvider).toEqual({
      name: 'Google',
      userId: 'google-user-id',
    });
  });
});
