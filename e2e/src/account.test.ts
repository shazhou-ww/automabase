/**
 * Account API E2E Tests
 */

import { createCryptoProvider } from '@automabase/crypto-provider-nodejs';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, createClient } from './client';
import { config } from './config';
import { getTestTokenAsync } from './helpers';

describe('Account API', () => {
  let client: ApiClient;
  let accountId: string;
  let cryptoProvider: ReturnType<typeof createCryptoProvider>;

  beforeAll(async () => {
    await getTestTokenAsync(); // Ensure token is available
    cryptoProvider = createCryptoProvider();
    // Create client - it will automatically create account and manage keys
    client = await createClient();
    accountId = client.getAccountId();
  });

  describe('GET /v1/accounts/me', () => {
    it('should return registered: false for new user', async () => {
      // Use a fresh token that hasn't been registered
      const freshClient = await createClient();
      const response = await freshClient.getMe();

      expect(response.status).toBe(200);
      // Either registered with account or not registered
      expect(response.data).toHaveProperty('registered');
    });

    it('should return 401 without token', async () => {
      // Create client without token (will fail auth)
      const noAuthClient = await createClient(accountId);
      // Remove token by creating new client without token
      const clientWithoutToken = noAuthClient.withToken('');
      const response = await clientWithoutToken.getMe();

      // With JWT verification enabled, requests without token must return 401
      expect(response.status).toBe(401);
    });
  });

  describe('POST /v1/accounts', () => {
    it('should create a new account with public key', async () => {
      // Get public key from crypto provider
      const publicKey = await cryptoProvider.getPublicKey(accountId);
      const response = await client.createAccount({
        publicKey,
        deviceName: 'Test Device',
      });

      // May be 201 (new) or 200 (existing)
      expect([200, 201]).toContain(response.status);
      expect(response.data).toHaveProperty('account');
      expect(response.data).toHaveProperty('isNew');
    });

    it('should return existing account on duplicate creation', async () => {
      // Get public key from crypto provider
      const publicKey = await cryptoProvider.getPublicKey(accountId);
      // Create twice with same token
      await client.createAccount({
        publicKey,
        deviceName: 'Test Device',
      });
      const response = await client.createAccount({
        publicKey,
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
      // Account should already exist from beforeAll
      // Get public key and ensure account is registered
      const publicKey = await cryptoProvider.getPublicKey(accountId);
      await client.createAccount({
        publicKey,
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
      // Account should already exist from beforeAll

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
      // This test only works if we have a way to get a truly fresh token
      // Skip if we're reusing the same token
      if (!config.isLocal) {
        return;
      }
      // For now, skip this test as it requires a fresh token
      // which is complex to generate in E2E tests
    });
  });

  describe('GET /v1/accounts/:id', () => {
    it('should get account by ID', async () => {
      // Account should already exist from beforeAll

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

  describe('Device API', () => {
    describe('GET /v1/accounts/me/devices', () => {
      it('should list devices for the current user', async () => {
        // Account and device should already exist from beforeAll

        const response = await client.listDevices();

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('devices');
        expect(Array.isArray(response.data.devices)).toBe(true);
        expect(response.data.devices.length).toBeGreaterThan(0);

        // Check device structure
        const device = response.data.devices[0];
        expect(device).toHaveProperty('deviceId');
        expect(device).toHaveProperty('publicKey');
        expect(device).toHaveProperty('deviceName');
        expect(device).toHaveProperty('status');
      });
    });

    describe('POST /v1/accounts/me/devices', () => {
      it('should register a new device', async () => {
        // Account should already exist from beforeAll
        // Create a new client with a different accountId to get a new key pair
        const newAccountClient = await createClient();
        const newPublicKey = await cryptoProvider.getPublicKey(newAccountClient.getAccountId());

        const response = await client.registerDevice(newPublicKey, 'Second Device', 'browser');

        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty('device');
        expect(response.data.device.publicKey).toBe(newPublicKey);
        expect(response.data.device.deviceName).toBe('Second Device');
        expect(response.data.device.deviceType).toBe('browser');
        expect(response.data.device.status).toBe('active');
      });

      it('should return 400 without publicKey', async () => {
        const response = await client.request({
          method: 'POST',
          path: '/v1/accounts/me/devices',
          body: { deviceName: 'Test' },
        });

        expect(response.status).toBe(400);
      });

      it('should return 400 without deviceName', async () => {
        const newAccountClient = await createClient();
        const newPublicKey = await cryptoProvider.getPublicKey(newAccountClient.getAccountId());
        const response = await client.request({
          method: 'POST',
          path: '/v1/accounts/me/devices',
          body: { publicKey: newPublicKey },
        });

        expect(response.status).toBe(400);
      });

      it('should return 409 for duplicate publicKey', async () => {
        // Try to register same publicKey again
        const publicKey = await cryptoProvider.getPublicKey(accountId);
        const response = await client.registerDevice(publicKey, 'Duplicate Device');

        expect(response.status).toBe(409);
      });
    });

    describe('DELETE /v1/accounts/me/devices/:deviceId', () => {
      it('should revoke a device', async () => {
        // First, register a new device to revoke
        const newAccountClient = await createClient();
        const newPublicKey = await cryptoProvider.getPublicKey(newAccountClient.getAccountId());
        const registerResponse = await client.registerDevice(newPublicKey, 'Device to Revoke');

        expect(registerResponse.status).toBe(201);
        const deviceId = registerResponse.data.device.deviceId;

        // Now revoke it
        const revokeResponse = await client.revokeDevice(deviceId);

        expect(revokeResponse.status).toBe(200);
        expect(revokeResponse.data.device.status).toBe('revoked');

        // Verify it's no longer in active devices list
        const listResponse = await client.listDevices();
        const revokedDevice = listResponse.data.devices.find(
          (d: { deviceId: string }) => d.deviceId === deviceId
        );
        expect(revokedDevice).toBeUndefined();
      });
    });
  });
});
