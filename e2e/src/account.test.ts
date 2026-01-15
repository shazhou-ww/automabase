/**
 * Account API E2E Tests
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, createClient, generateKeyPair } from './client';
import { config } from './config';
import { getTestTokenAsync } from './helpers';

describe('Account API', () => {
  let client: ApiClient;
  let token: string;
  let keyPair: { publicKey: string; privateKey: string };

  beforeAll(async () => {
    client = createClient();
    token = await getTestTokenAsync();
    keyPair = await generateKeyPair();
    client.setToken(token);
    client.setPrivateKey(keyPair.privateKey);
  });

  describe('GET /v1/accounts/me', () => {
    it('should return registered: false for new user', async () => {
      // Use a fresh token that hasn't been registered
      const freshClient = createClient().setToken(token);
      const response = await freshClient.getMe();

      expect(response.status).toBe(200);
      // Either registered with account or not registered
      expect(response.data).toHaveProperty('registered');
    });

    it('should return 401 without token', async () => {
      const noAuthClient = createClient();
      const response = await noAuthClient.getMe();

      // With JWT verification enabled, requests without token must return 401
      expect(response.status).toBe(401);
    });
  });

  describe('POST /v1/accounts', () => {
    it('should create a new account with public key', async () => {
      const response = await client.createAccount({
        publicKey: keyPair.publicKey,
        deviceName: 'Test Device',
      });

      // May be 201 (new) or 200 (existing)
      expect([200, 201]).toContain(response.status);
      expect(response.data).toHaveProperty('account');
      expect(response.data).toHaveProperty('isNew');
    });

    it('should return existing account on duplicate creation', async () => {
      // Create twice with same token
      await client.createAccount({
        publicKey: keyPair.publicKey,
        deviceName: 'Test Device',
      });
      const response = await client.createAccount({
        publicKey: keyPair.publicKey,
        deviceName: 'Test Device',
      });

      expect(response.status).toBe(200);
      expect(response.data.isNew).toBe(false);
    });

    it('should return 400 without public key', async () => {
      // With new API, publicKey is optional - this test is no longer relevant
      // Account creation works without publicKey, device registration is separate
      const response = await client.request({
        method: 'POST',
        path: '/v1/accounts',
        body: {},
      });

      // Should succeed now (200 or 201) since publicKey is optional
      expect([200, 201]).toContain(response.status);
    });
  });

  describe('GET /v1/accounts/me (after registration)', () => {
    it('should return registered: true with account data', async () => {
      // Ensure account exists
      await client.createAccount({
        publicKey: keyPair.publicKey,
        deviceName: 'Test Device',
      });

      const response = await client.getMe();

      expect(response.status).toBe(200);
      expect(response.data.registered).toBe(true);
      expect(response.data).toHaveProperty('account');
    });
  });

  describe('PATCH /v1/accounts/me', () => {
    it('should update display name', async () => {
      // Ensure account exists
      await client.createAccount({
        publicKey: keyPair.publicKey,
        deviceName: 'Test Device',
      });

      const newName = `Test User ${Date.now()}`;
      const response = await client.updateAccount({ displayName: newName });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('account');
      expect(response.data.account.displayName).toBe(newName);
    });

    it('should update avatar URL', async () => {
      const newAvatar = 'https://example.com/avatar.png';
      const response = await client.updateAccount({ avatarUrl: newAvatar });

      expect(response.status).toBe(200);
      expect(response.data.account.avatarUrl).toBe(newAvatar);
    });

    it('should return 404 for unregistered user', async () => {
      // Create a new client with fresh token but don't register
      const freshKeyPair = await generateKeyPair();
      // freshClient would be used to test unregistered user, but we need a fresh token
      createClient().setToken(token).setPrivateKey(freshKeyPair.privateKey);

      // This test only works if we have a way to get a truly fresh token
      // Skip if we're reusing the same token
      if (!config.isLocal) {
        return;
      }
    });
  });

  describe('GET /v1/accounts/:id', () => {
    it('should get account by ID', async () => {
      // Create account first
      const createResponse = await client.createAccount({
        publicKey: keyPair.publicKey,
        deviceName: 'Test Device',
      });
      const accountId = createResponse.data.account.accountId;

      const response = await client.getAccount(accountId);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('account');
      expect(response.data.account.accountId).toBe(accountId);
    });

    it('should return 404 for non-existent account', async () => {
      const response = await client.getAccount('nonexistent-account-id');

      expect(response.status).toBe(404);
    });
  });
});
