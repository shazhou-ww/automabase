/**
 * Automata IndexedDB Store & Client Wrapper
 * Local caching and offline support
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { AutomataClient } from './client';
import type { StoredAutomata, AutomataMeta, PostEventRequest, PostEventResponse } from './types';

const DB_NAME = 'automata-store';
const DB_VERSION = 1;
const STORE_NAME = 'automata';

interface AutomataDB {
  automata: {
    key: string;
    value: StoredAutomata;
    indexes: {
      'by-synced': string;
    };
  };
}

/**
 * IndexedDB store for local automata caching
 */
export class AutomataStore {
  private dbPromise: Promise<IDBPDatabase<AutomataDB>> | null = null;

  private async getDB(): Promise<IDBPDatabase<AutomataDB>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<AutomataDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-synced', 'syncedAt');
        },
      });
    }
    return this.dbPromise;
  }

  async save(automata: StoredAutomata): Promise<void> {
    const db = await this.getDB();
    await db.put(STORE_NAME, automata);
  }

  async saveState(id: string, state: unknown, version: string): Promise<void> {
    const db = await this.getDB();
    const existing = await db.get(STORE_NAME, id);

    const record: StoredAutomata = {
      id,
      state,
      version,
      meta: existing?.meta,
      syncedAt: new Date().toISOString(),
    };

    await db.put(STORE_NAME, record);
  }

  async saveMeta(meta: AutomataMeta): Promise<void> {
    const db = await this.getDB();
    const existing = await db.get(STORE_NAME, meta.id);

    const record: StoredAutomata = {
      id: meta.id,
      state: meta.state,
      version: meta.version,
      meta,
      syncedAt: new Date().toISOString(),
    };

    // Preserve existing state if it's newer
    if (existing && existing.version > meta.version) {
      record.state = existing.state;
      record.version = existing.version;
    }

    await db.put(STORE_NAME, record);
  }

  async get(id: string): Promise<StoredAutomata | undefined> {
    const db = await this.getDB();
    return db.get(STORE_NAME, id);
  }

  async getState(id: string): Promise<{ state: unknown; version: string } | null> {
    const record = await this.get(id);
    if (!record) return null;
    return { state: record.state, version: record.version };
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(STORE_NAME, id);
  }

  async listIds(): Promise<string[]> {
    const db = await this.getDB();
    const keys = await db.getAllKeys(STORE_NAME);
    return keys as string[];
  }

  async listAll(): Promise<StoredAutomata[]> {
    const db = await this.getDB();
    return db.getAll(STORE_NAME);
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    await db.clear(STORE_NAME);
  }

  async has(id: string): Promise<boolean> {
    const db = await this.getDB();
    const count = await db.count(STORE_NAME, id);
    return count > 0;
  }
}

/**
 * Cached client that wraps AutomataClient with IndexedDB caching
 */
export interface CachedAutomataClient extends AutomataClient {
  /** The underlying store */
  readonly store: AutomataStore;
  /** Get cached state (sync, from memory or IndexedDB) */
  getCached(automataId: string): Promise<{ state: unknown; version: string } | null>;
  /** Clear cache for an automata */
  clearCache(automataId: string): Promise<void>;
  /** Clear all cache */
  clearAllCache(): Promise<void>;
}

/**
 * Wrap an AutomataClient with IndexedDB caching
 * 
 * @example
 * ```typescript
 * const client = new AutomataClient({ baseUrl: '...', wsUrl: '...' });
 * const cachedClient = withStore(client);
 * 
 * // Now all get/postEvent operations are cached
 * const meta = await cachedClient.get('automata-id');
 * ```
 */
export function withStore(
  client: AutomataClient,
  store: AutomataStore = new AutomataStore()
): CachedAutomataClient {
  // Create a proxy that intercepts get, postEvent, delete, and subscribe
  const cachedClient = Object.create(client) as CachedAutomataClient;

  // Expose store
  Object.defineProperty(cachedClient, 'store', {
    value: store,
    writable: false,
  });

  // Override get - cache the result
  cachedClient.get = async function (automataId: string): Promise<AutomataMeta> {
    const meta = await client.get(automataId);
    await store.saveMeta(meta);
    return meta;
  };

  // Override postEvent - update cache
  cachedClient.postEvent = async function (
    automataId: string,
    event: PostEventRequest
  ): Promise<PostEventResponse> {
    const result = await client.postEvent(automataId, event);
    await store.saveState(automataId, result.state, result.version);
    return result;
  };

  // Override delete - clear cache
  cachedClient.delete = async function (automataId: string): Promise<void> {
    await client.delete(automataId);
    await store.delete(automataId);
  };

  // Override subscribe - cache state updates
  const originalSubscribe = client.subscribe.bind(client);
  cachedClient.subscribe = function (
    automataId: string,
    callback: (
      state: unknown,
      version: string,
      event?: { type: string; data: unknown },
      timestamp?: string
    ) => void
  ): () => void {
    return originalSubscribe(automataId, (state, version, event, timestamp) => {
      // Save to cache asynchronously
      store.saveState(automataId, state, version).catch(console.error);
      // Call original callback
      callback(state, version, event, timestamp);
    });
  };

  // Add cache helper methods
  cachedClient.getCached = async function (automataId: string) {
    return store.getState(automataId);
  };

  cachedClient.clearCache = async function (automataId: string) {
    await store.delete(automataId);
  };

  cachedClient.clearAllCache = async function () {
    await store.clear();
  };

  return cachedClient;
}

// Default singleton store instance
export const automataStore = new AutomataStore();
