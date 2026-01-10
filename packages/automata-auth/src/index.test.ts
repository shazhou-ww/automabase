import { describe, expect, it } from 'vitest';
import {
  type CognitoIdTokenClaims,
  extractAuthContext,
  extractAuthContextFromLocalJwt,
  extractBearerToken,
  generateLocalKeyPair,
  JwtVerificationError,
  signLocalJwt,
  verifyLocalJwt,
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
      identities: [{ providerName: 'Google', userId: 'google-user-id' }],
    };

    const context = extractAuthContext(claims);

    expect(context.identityProvider).toEqual({
      name: 'Google',
      userId: 'google-user-id',
    });
  });
});

describe('Local JWT', () => {
  it('should generate Ed25519 key pair', async () => {
    const { privateKey, publicKey } = await generateLocalKeyPair();

    expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    expect(privateKey).toContain('-----END PRIVATE KEY-----');
    expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
    expect(publicKey).toContain('-----END PUBLIC KEY-----');
  });

  it('should sign and verify JWT', async () => {
    const { privateKey, publicKey } = await generateLocalKeyPair();

    const token = await signLocalJwt(
      {
        sub: 'test-user',
        email: 'test@example.com',
        name: 'Test User',
        accountId: 'account-123',
      },
      {
        privateKey,
        issuer: 'test-issuer',
        expiresIn: '1h',
      }
    );

    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);

    const payload = await verifyLocalJwt(token, {
      publicKey,
      issuer: 'test-issuer',
    });

    expect(payload.sub).toBe('test-user');
    expect(payload.email).toBe('test@example.com');
    expect(payload.name).toBe('Test User');
    expect(payload.accountId).toBe('account-123');
  });

  it('should reject token with wrong issuer', async () => {
    const { privateKey, publicKey } = await generateLocalKeyPair();

    const token = await signLocalJwt({ sub: 'test-user' }, { privateKey, issuer: 'issuer-a' });

    await expect(verifyLocalJwt(token, { publicKey, issuer: 'issuer-b' })).rejects.toThrow();
  });

  it('should reject token signed with different key', async () => {
    const keyPair1 = await generateLocalKeyPair();
    const keyPair2 = await generateLocalKeyPair();

    const token = await signLocalJwt(
      { sub: 'test-user' },
      { privateKey: keyPair1.privateKey, issuer: 'test' }
    );

    await expect(
      verifyLocalJwt(token, { publicKey: keyPair2.publicKey, issuer: 'test' })
    ).rejects.toThrow();
  });

  it('should extract auth context from local JWT payload', () => {
    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/avatar.jpg',
      'custom:account_id': 'account-456',
      'custom:spk': 'session-public-key',
      identities: [{ providerName: 'Google', userId: 'google-id' }],
    };

    const context = extractAuthContextFromLocalJwt(payload);

    expect(context.cognitoUserId).toBe('user-123');
    expect(context.email).toBe('test@example.com');
    expect(context.displayName).toBe('Test User');
    expect(context.avatarUrl).toBe('https://example.com/avatar.jpg');
    expect(context.accountId).toBe('account-456');
    expect(context.sessionPublicKey).toBe('session-public-key');
    expect(context.identityProvider).toEqual({
      name: 'Google',
      userId: 'google-id',
    });
  });
});
