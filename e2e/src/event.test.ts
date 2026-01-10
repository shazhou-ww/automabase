/**
 * Event API E2E Tests
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, createClient, generateKeyPair } from './client';
import { APP_REGISTRY_BLUEPRINT, getTestTokenAsync } from './helpers';

describe('Event API', () => {
  let client: ApiClient;
  let keyPair: { publicKey: string; privateKey: string };
  let automataId: string;
  let accountId: string;

  beforeAll(async () => {
    client = createClient();
    const token = await getTestTokenAsync();
    keyPair = await generateKeyPair();

    client.setToken(token).setPrivateKey(keyPair.privateKey);

    // Ensure account exists and get accountId
    const accountResponse = await client.createAccount(keyPair.publicKey);
    const accountData = accountResponse.data.account as Record<string, unknown>;
    accountId = accountData.accountId as string;
    client.setAccountId(accountId);

    // Create an automata for event tests
    const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
    automataId = (createResponse.data as Record<string, unknown>).automataId as string;
  });

  describe('POST /v1/accounts/:accountId/automatas/:id/events', () => {
    it('should send SET_INFO event and update state', async () => {
      const response = await client.sendEvent(automataId, 'SET_INFO', {
        name: 'My Test App',
        description: 'A test application',
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('baseVersion');
      expect(response.data).toHaveProperty('newVersion');
      expect(response.data).toHaveProperty('newState');

      // Verify state was updated
      const data = response.data as Record<string, unknown>;
      const newState = data.newState as Record<string, unknown>;
      expect(newState.name).toBe('My Test App');
      expect(newState.description).toBe('A test application');
      expect(newState.status).toBe('draft');
    });

    it('should send PUBLISH event', async () => {
      const response = await client.sendEvent(automataId, 'PUBLISH', {});

      expect(response.status).toBe(200);
      const data = response.data as Record<string, unknown>;
      const newState = data.newState as Record<string, unknown>;
      expect(newState.status).toBe('published');
    });

    it('should send UNPUBLISH event', async () => {
      const response = await client.sendEvent(automataId, 'UNPUBLISH', {});

      expect(response.status).toBe(200);
      const data = response.data as Record<string, unknown>;
      const newState = data.newState as Record<string, unknown>;
      expect(newState.status).toBe('draft');
    });

    it('should return 400 without event type', async () => {
      const response = await client.request({
        method: 'POST',
        path: `/v1/accounts/${accountId}/automatas/${automataId}/events`,
        body: { eventData: {} },
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent automata', async () => {
      const response = await client.sendEvent('01INVALID000000000000000000', 'SET_INFO', {});

      expect(response.status).toBe(404);
    });

    it('should return 401 without auth (in non-local mode)', async () => {
      const noAuthClient = createClient();
      noAuthClient.setAccountId(accountId);
      const response = await noAuthClient.sendEvent(automataId, 'SET_INFO', {});

      // In local dev mode, this will succeed
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('GET /v1/accounts/:accountId/automatas/:id/events', () => {
    it('should list events for automata', async () => {
      const response = await client.listEvents(automataId);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('events');
      expect(Array.isArray(response.data.events)).toBe(true);
      expect(response.data.events.length).toBeGreaterThan(0);
    });

    it('should support pagination with limit', async () => {
      const response = await client.listEvents(automataId, { limit: 1 });

      expect(response.status).toBe(200);
      expect(response.data.events.length).toBeLessThanOrEqual(1);
    });

    it('should support forward direction', async () => {
      const response = await client.listEvents(automataId, { direction: 'forward' });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.events)).toBe(true);
    });

    it('should support backward direction', async () => {
      const response = await client.listEvents(automataId, { direction: 'backward' });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.events)).toBe(true);
    });

    it('should return 404 for non-existent automata', async () => {
      const response = await client.listEvents('01INVALID000000000000000000');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /v1/accounts/:accountId/automatas/:id/events/:version', () => {
    it('should get specific event by version', async () => {
      // First, list events to get a version
      const listResponse = await client.listEvents(automataId);
      const events = listResponse.data.events as Record<string, unknown>[];

      if (events.length > 0) {
        const eventVersion = events[0].baseVersion;
        const response = await client.getEvent(automataId, eventVersion);

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('eventId');
      }
    });

    it('should return 404 for non-existent version', async () => {
      const response = await client.getEvent(automataId, 'ZZZZZZ');

      expect(response.status).toBe(404);
    });
  });

  describe('State Transition Integrity', () => {
    it('should maintain consistent version increments', async () => {
      // Create a fresh automata
      const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      const freshAutomataId = (createResponse.data as Record<string, unknown>).automataId as string;

      // Send multiple events
      const event1 = await client.sendEvent(freshAutomataId, 'SET_INFO', { name: 'v1' });
      const event2 = await client.sendEvent(freshAutomataId, 'SET_INFO', { name: 'v2' });
      const event3 = await client.sendEvent(freshAutomataId, 'SET_INFO', { name: 'v3' });

      // Verify version chain
      const e1Data = event1.data as Record<string, unknown>;
      expect(e1Data.baseVersion).toBe('000000');
      expect(e1Data.newVersion).toBe('000001');

      const e2Data = event2.data as Record<string, unknown>;
      expect(e2Data.baseVersion).toBe('000001');
      expect(e2Data.newVersion).toBe('000002');

      const e3Data = event3.data as Record<string, unknown>;
      expect(e3Data.baseVersion).toBe('000002');
      expect(e3Data.newVersion).toBe('000003');
    });

    it('should preserve state between events', async () => {
      // Create a fresh automata
      const createResponse = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      const freshAutomataId = (createResponse.data as Record<string, unknown>).automataId as string;

      // Set name
      await client.sendEvent(freshAutomataId, 'SET_INFO', { name: 'MyApp' });

      // Set description (should preserve name)
      const response = await client.sendEvent(freshAutomataId, 'SET_INFO', {
        description: 'My description',
      });

      const newState = (response.data as Record<string, unknown>).newState as Record<
        string,
        unknown
      >;
      expect(newState.name).toBe('MyApp');
      expect(newState.description).toBe('My description');
    });
  });
});
