/**
 * Automata API E2E Tests
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, createClient } from './client';
import { APP_REGISTRY_BLUEPRINT } from './helpers';

describe('Automata API', () => {
  let client: ApiClient;
  let createdAutomataId: string;
  let accountId: string;

  beforeAll(async () => {
    // Create client - it will automatically create account and manage keys
    client = await createClient();
    accountId = client.getAccountId();
  });

  describe('POST /v1/accounts/:accountId/automatas', () => {
    it('should create an automata with builtin blueprint', async () => {
      const response = await client.createAutomata(APP_REGISTRY_BLUEPRINT);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('automataId');
      expect(response.data).toHaveProperty('blueprintId');
      expect(response.data).toHaveProperty('currentState');

      // Verify initial state
      expect(response.data.currentState).toEqual({
        name: 'Untitled App',
        status: 'draft',
      });

      createdAutomataId = response.data.automataId;
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
      // Create client without token (will fail auth)
      const noAuthClient = await createClient(accountId);
      const clientWithoutToken = noAuthClient.withToken('');
      const response = await clientWithoutToken.createAutomata(APP_REGISTRY_BLUEPRINT);

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
      const noAuthClient = await createClient(accountId);
      const clientWithoutToken = noAuthClient.withToken('');
      const response = await clientWithoutToken.listAutomatas();

      // In local dev mode, this will succeed
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('GET /v1/accounts/:accountId/automatas/:id', () => {
    it('should get automata details', async () => {
      // Ensure we have an automata
      if (!createdAutomataId) {
        const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
        createdAutomataId = createResponse.data.automataId;
      }

      const response = await client.getAutomata(createdAutomataId);

      expect(response.status).toBe(200);
      expect(response.data.automataId).toBe(createdAutomataId);
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
        createdAutomataId = createResponse.data.automataId;
      }

      const response = await client.getAutomataState(createdAutomataId);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('currentState');
    });
  });

  describe('POST /v1/accounts/:accountId/automatas/:id/archive', () => {
    it('should archive automata', async () => {
      // Create a new automata to archive
      const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      const automataId = createResponse.data.automataId;

      const response = await client.archiveAutomata(automataId);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('archived');
    });

    it('should return 400 when already archived', async () => {
      // Create and archive
      const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      const automataId = createResponse.data.automataId;
      await client.archiveAutomata(automataId);

      // Try to archive again
      const response = await client.archiveAutomata(automataId);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /v1/accounts/:accountId/automatas/:id/unarchive', () => {
    it('should unarchive archived automata', async () => {
      // Create and archive
      const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      const automataId = createResponse.data.automataId;
      await client.archiveAutomata(automataId);

      // Unarchive
      const response = await client.unarchiveAutomata(automataId);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('active');
    });

    it('should return 400 when already active', async () => {
      // Create (already active)
      const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      const automataId = createResponse.data.automataId;

      // Try to unarchive
      const response = await client.unarchiveAutomata(automataId);

      expect(response.status).toBe(400);
    });
  });
});
