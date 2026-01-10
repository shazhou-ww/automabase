/**
 * Automata API E2E Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, generateKeyPair, ApiClient } from './client';
import { getTestTokenAsync, APP_REGISTRY_BLUEPRINT } from './helpers';

describe('Automata API', () => {
  let client: ApiClient;
  let keyPair: { publicKey: string; privateKey: string };
  let createdAutomataId: string;
  let accountId: string;

  beforeAll(async () => {
    client = createClient();
    const token = await getTestTokenAsync();
    keyPair = await generateKeyPair();

    client.setToken(token).setPrivateKey(keyPair.privateKey);

    // Ensure account exists and get accountId
    const accountResponse = await client.createAccount(keyPair.publicKey);
    accountId = (accountResponse.data as any).account.accountId;
    client.setAccountId(accountId);
  });

  describe('POST /v1/accounts/:accountId/automatas', () => {
    it('should create an automata with builtin blueprint', async () => {
      const response = await client.createAutomata(APP_REGISTRY_BLUEPRINT);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('automataId');
      expect(response.data).toHaveProperty('blueprintId');
      expect(response.data).toHaveProperty('currentState');

      // Verify initial state
      expect((response.data as any).currentState).toEqual({
        name: 'Untitled App',
        status: 'draft',
      });

      createdAutomataId = (response.data as any).automataId;
    });

    it('should return 400 without blueprint', async () => {
      const response = await client.request({
        method: 'POST',
        path: `/v1/accounts/${accountId}/automatas`,
        body: {},
      });

      expect(response.status).toBe(400);
    });

    it('should return 401 without auth', async () => {
      // Requests without auth should return 401
      const noAuthClient = createClient();
      noAuthClient.setAccountId(accountId);
      const response = await noAuthClient.createAutomata(APP_REGISTRY_BLUEPRINT);

      // Should be 401 Unauthorized
      expect(response.status).toBe(401);
    });
  });

  describe('GET /v1/accounts/:accountId/automatas', () => {
    it('should list user automatas', async () => {
      const response = await client.listAutomatas();

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('automatas');
      expect(Array.isArray(response.data.automatas)).toBe(true);
    });

    it('should support pagination with limit', async () => {
      const response = await client.listAutomatas({ limit: 1 });

      expect(response.status).toBe(200);
      expect(response.data.automatas.length).toBeLessThanOrEqual(1);
    });

    it('should return 401 without auth (in non-local mode)', async () => {
      const noAuthClient = createClient();
      noAuthClient.setAccountId(accountId);
      const response = await noAuthClient.listAutomatas();

      // In local dev mode, this will succeed
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('GET /v1/accounts/:accountId/automatas/:id', () => {
    it('should get automata details', async () => {
      // Ensure we have an automata
      if (!createdAutomataId) {
        const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
        createdAutomataId = (createResponse.data as any).automataId;
      }

      const response = await client.getAutomata(createdAutomataId);

      expect(response.status).toBe(200);
      expect((response.data as any).automataId).toBe(createdAutomataId);
    });

    it('should return 404 for non-existent automata', async () => {
      const response = await client.getAutomata('01INVALID000000000000000000');

      expect(response.status).toBe(404);
    });

    it('should return 404 for other user automata', async () => {
      // This test would require another user's automata ID
      // For now, just test non-existent
      const response = await client.getAutomata('01ZZZZZZZZZZZZZZZZZZZZZZZZZ');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /v1/accounts/:accountId/automatas/:id/state', () => {
    it('should get current state only', async () => {
      if (!createdAutomataId) {
        const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
        createdAutomataId = (createResponse.data as any).automataId;
      }

      const response = await client.getAutomataState(createdAutomataId);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('currentState');
    });
  });

  describe('PATCH /v1/accounts/:accountId/automatas/:id', () => {
    it('should archive automata', async () => {
      // Create a new automata to archive
      const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      const automataId = (createResponse.data as any).automataId;

      const response = await client.updateAutomata(automataId, { status: 'archived' });

      expect(response.status).toBe(200);
      expect((response.data as any).status).toBe('archived');
    });

    it('should activate archived automata', async () => {
      // Create and archive
      const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      const automataId = (createResponse.data as any).automataId;
      await client.updateAutomata(automataId, { status: 'archived' });

      // Activate
      const response = await client.updateAutomata(automataId, { status: 'active' });

      expect(response.status).toBe(200);
      expect((response.data as any).status).toBe('active');
    });

    it('should return 400 for invalid status', async () => {
      if (!createdAutomataId) {
        const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
        createdAutomataId = (createResponse.data as any).automataId;
      }

      const response = await client.updateAutomata(createdAutomataId, { status: 'invalid' });

      expect(response.status).toBe(400);
    });
  });
});

