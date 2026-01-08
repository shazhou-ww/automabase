/**
 * Automata client initialization
 */

import { AutomataClient, setAutomataClient, withStore } from '@automabase/automata-client';

// API base URL (proxied through Vite in dev, or direct in production)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const WS_URL = import.meta.env.VITE_WS_URL || undefined;

let client: ReturnType<typeof withStore> | null = null;

export function initializeClient() {
  if (client) return client;

  const baseClient = new AutomataClient({
    baseUrl: API_BASE_URL,
    wsUrl: WS_URL,
  });

  // Wrap with IndexedDB caching
  client = withStore(baseClient);

  // Set as global client for hooks
  setAutomataClient(client);

  return client;
}

export function getClient() {
  if (!client) {
    throw new Error('Client not initialized');
  }
  return client;
}

// Counter automata schema
export const COUNTER_SCHEMA = {
  stateSchema: {
    type: 'object',
    properties: {
      count: { type: 'number' },
      lastUpdated: { type: 'string' },
    },
    required: ['count'],
  },
  eventSchemas: {
    INCREMENT: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
      },
    },
    DECREMENT: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
      },
    },
    RESET: {
      type: 'object',
    },
    SET: {
      type: 'object',
      properties: {
        value: { type: 'number' },
      },
      required: ['value'],
    },
  },
  initialState: {
    count: 0,
    lastUpdated: null,
  },
  transition: `
    (
      $amt := event.data.amount ? event.data.amount : 1;
      $ts := $now();
      
      event.type = 'INCREMENT' ? { 'count': state.count + $amt, 'lastUpdated': $ts } :
      event.type = 'DECREMENT' ? { 'count': state.count - $amt, 'lastUpdated': $ts } :
      event.type = 'RESET' ? { 'count': 0, 'lastUpdated': $ts } :
      event.type = 'SET' ? { 'count': event.data.value, 'lastUpdated': $ts } :
      state
    )
  `.trim(),
};
