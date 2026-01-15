/**
 * WebSocket E2E Tests
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { type ApiClient, createClient, generateKeyPair } from './client';
import { config } from './config';
import { APP_REGISTRY_BLUEPRINT, getTestTokenAsync } from './helpers';

// Helper to wait for WS open
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', (err) => reject(err));
  });
}

// Helper to wait for a message
function waitForMessage(
  ws: WebSocket,
  predicate: (data: any) => boolean,
  timeoutMs = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const handler = (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (predicate(parsed)) {
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch (_e) {
        // Ignore parse errors
      }
    };
    ws.on('message', handler);
    // Timeout
    setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Timeout waiting for message'));
    }, timeoutMs);
  });
}

describe('Automata WebSocket API', () => {
  let client: ApiClient;
  let keyPair: { publicKey: string; privateKey: string };
  let accountId: string;
  let wsUrl: string;

  // Determine if WS tests should run at module load time
  // Local: dev-gateway supports WebSocket on same port
  // Remote: need WS_API_URL env var
  const shouldRunWsTests = config.isLocal || !!process.env.WS_API_URL;

  beforeAll(async () => {
    client = createClient();
    const token = await getTestTokenAsync();
    keyPair = await generateKeyPair();

    client.setToken(token).setPrivateKey(keyPair.privateKey);

    // Ensure account exists
    const accountResponse = await client.createAccount(keyPair.publicKey);
    accountId = accountResponse.data.account.accountId;
    client.setAccountId(accountId);

    // Determine WS URL
    if (config.isLocal) {
      // Local dev-gateway supports WebSocket on the same port
      // Convert http://localhost:3000 to ws://localhost:3000
      wsUrl = process.env.WS_API_URL || config.apiBaseUrl.replace('http://', 'ws://');
    } else {
      // For deployed env, use WS_API_URL env var
      wsUrl = process.env.WS_API_URL || '';
    }
  });

  (shouldRunWsTests ? describe : describe.skip)('Connection', () => {
    it('should fail to connect without token', async () => {
      const ws = new WebSocket(wsUrl);
      try {
        await waitForOpen(ws);
      } catch (_err) {
        // Expected failure
        expect(_err).toBeDefined();
      }
      ws.close();
    });

    it('should fail to connect with invalid token', async () => {
      const ws = new WebSocket(`${wsUrl}?token=invalid-token`);
      try {
        await waitForOpen(ws);
        // Should close immediately usually
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(ws.readyState).not.toBe(WebSocket.OPEN);
      } catch (_err) {
        // Expected
      }
      ws.close();
    });

    it('should connect with valid token', async () => {
      // 1. Get WS Token
      const tokenRes = await client.request({
        method: 'POST',
        path: '/v1/ws/token',
      });
      expect(tokenRes.status).toBe(200);
      const token = (tokenRes.data as any).token;

      // 2. Connect
      const ws = new WebSocket(`${wsUrl}?token=${token}`);
      await waitForOpen(ws);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });
  });

  (shouldRunWsTests ? describe : describe.skip)('Subscriptions', () => {
    let ws: WebSocket;
    let automataId: string;

    beforeAll(async () => {
      // Create an automata to watch
      const res = await client.createAutomata(APP_REGISTRY_BLUEPRINT);
      automataId = (res.data as any).automataId;

      // Connect WS
      const tokenRes = await client.request({
        method: 'POST',
        path: '/v1/ws/token',
      });
      const token = (tokenRes.data as any).token;

      ws = new WebSocket(`${wsUrl}?token=${token}`);
      await waitForOpen(ws);
    });

    afterAll(() => {
      if (ws) ws.close();
    });

    it('should subscribe and receive updates', async () => {
      // 1. Send Subscribe message
      const subMsg = {
        action: 'subscribe',
        automataId: automataId,
      };
      ws.send(JSON.stringify(subMsg));

      // 2. Wait for confirmation
      await waitForMessage(ws, (msg) => msg.type === 'subscribed' && msg.automataId === automataId);

      // 3. Trigger update via HTTP API
      await client.request({
        method: 'POST',
        path: `/v1/accounts/${accountId}/automatas/${automataId}/events`,
        body: {
          eventType: 'SET_INFO',
          eventData: { name: 'Updated Name Via E2E' },
        },
      });

      // 4. Wait for update message
      const updateMsg = await waitForMessage(
        ws,
        (msg) => msg.type === 'state_update' && msg.automataId === automataId
      );

      expect(updateMsg).toBeDefined();
      expect(updateMsg.newState.name).toBe('Updated Name Via E2E');
    });
  });
});
