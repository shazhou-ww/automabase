/**
 * React Hooks for Automata
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { AutomataClient } from './client';
import type { CachedAutomataClient } from './store';
import type {
  UseAutomataOptions,
  UseAutomataResult,
  PostEventResponse,
} from './types';

// Global client instance
let globalClient: AutomataClient | CachedAutomataClient | null = null;

/**
 * Set global automata client (call once at app initialization)
 * 
 * @example
 * ```typescript
 * const client = new AutomataClient({ baseUrl: '...', wsUrl: '...' });
 * const cachedClient = withStore(client);
 * setAutomataClient(cachedClient);
 * ```
 */
export function setAutomataClient(client: AutomataClient | CachedAutomataClient): void {
  globalClient = client;
}

/**
 * Get global automata client
 */
export function getAutomataClient(): AutomataClient | CachedAutomataClient {
  if (!globalClient) {
    throw new Error(
      'Automata client not initialized. Call setAutomataClient() first.'
    );
  }
  return globalClient;
}

/**
 * Check if client has cache capabilities
 */
function isCachedClient(client: AutomataClient | CachedAutomataClient): client is CachedAutomataClient {
  return 'store' in client && 'getCached' in client;
}

/**
 * Hook to use an automata with real-time updates and local caching
 * 
 * @example
 * ```typescript
 * function Counter({ id }: { id: string }) {
 *   const { state, send, loading, connected } = useAutomata<{ count: number }>(id);
 * 
 *   if (loading) return <div>Loading...</div>;
 * 
 *   return (
 *     <div>
 *       <p>Count: {state?.count}</p>
 *       <button onClick={() => send('INCREMENT')}>+</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAutomata<TState = unknown>(
  automataId: string | null,
  options: UseAutomataOptions = {}
): UseAutomataResult<TState> {
  const {
    subscribe = true,
    useLocalCache = true,
    onStateChange,
  } = options;

  const [state, setState] = useState<TState | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const client = useMemo(() => {
    try {
      return getAutomataClient();
    } catch {
      return null;
    }
  }, []);

  // Load from local cache first (if available)
  useEffect(() => {
    if (!automataId || !useLocalCache || !client || !isCachedClient(client)) return;

    client.getCached(automataId).then((cached) => {
      if (cached) {
        setState(cached.state as TState);
        setVersion(cached.version);
        setLoading(false);
      }
    });
  }, [automataId, useLocalCache, client]);

  // Fetch from server
  const refresh = useCallback(async () => {
    if (!automataId || !client) return;

    try {
      setLoading(true);
      setError(null);

      const meta = await client.get(automataId);
      setState(meta.state as TState);
      setVersion(meta.version);

      onStateChangeRef.current?.(meta.state, meta.version);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [automataId, client]);

  // Initial fetch
  useEffect(() => {
    if (!automataId) {
      setState(null);
      setVersion(null);
      setLoading(false);
      return;
    }

    refresh();
  }, [automataId, refresh]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!automataId || !subscribe || !client?.trackingEnabled) return;

    // Track connection status
    const originalCallbacks = { ...client['trackerCallbacks'] };
    client.setTrackerCallbacks({
      ...originalCallbacks,
      onConnected: () => {
        setConnected(true);
        originalCallbacks.onConnected?.();
      },
      onDisconnected: () => {
        setConnected(false);
        originalCallbacks.onDisconnected?.();
      },
      onError: (msg) => {
        setError(msg);
        originalCallbacks.onError?.(msg);
      },
    });

    // Set initial connection state
    setConnected(client.connected);

    const unsubscribe = client.subscribe(automataId, (newState, newVersion) => {
      setState(newState as TState);
      setVersion(newVersion);
      setLoading(false);
      onStateChangeRef.current?.(newState, newVersion);
    });

    return () => {
      unsubscribe();
      client.setTrackerCallbacks(originalCallbacks);
    };
  }, [automataId, subscribe, client]);

  // Send event function
  const send = useCallback(
    async (type: string, data?: unknown): Promise<PostEventResponse | null> => {
      if (!automataId || !client) {
        setError('No automata selected');
        return null;
      }

      try {
        setError(null);
        const result = await client.postEvent(automataId, { type, data });

        // If not subscribed to real-time updates, update state manually
        if (!subscribe || !client.trackingEnabled) {
          setState(result.state as TState);
          setVersion(result.version);
          onStateChangeRef.current?.(result.state, result.version);
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send event';
        setError(message);
        return null;
      }
    },
    [automataId, client, subscribe]
  );

  return {
    state,
    version,
    loading,
    error,
    connected,
    send,
    refresh,
  };
}

/**
 * Hook to create a new automata
 */
export function useCreateAutomata() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    try {
      return getAutomataClient();
    } catch {
      return null;
    }
  }, []);

  const create = useCallback(
    async (request: {
      stateSchema: unknown;
      eventSchemas: Record<string, unknown>;
      initialState: unknown;
      transition: string;
    }): Promise<string | null> => {
      if (!client) {
        setError('Client not initialized');
        return null;
      }

      try {
        setLoading(true);
        setError(null);
        const result = await client.create(request);
        return result.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { create, loading, error };
}

/**
 * Hook to delete an automata
 */
export function useDeleteAutomata() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    try {
      return getAutomataClient();
    } catch {
      return null;
    }
  }, []);

  const deleteAutomata = useCallback(
    async (automataId: string): Promise<boolean> => {
      if (!client) {
        setError('Client not initialized');
        return false;
      }

      try {
        setLoading(true);
        setError(null);
        await client.delete(automataId);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete';
        setError(message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { deleteAutomata, loading, error };
}

/**
 * Hook to get event history
 */
export function useAutomataHistory(
  automataId: string | null,
  options: { direction?: 'backtrace' | 'replay'; limit?: number } = {}
) {
  const { direction = 'backtrace', limit = 20 } = options;

  const [events, setEvents] = useState<
    Array<{
      version: string;
      type: string;
      data: unknown;
      nextState: unknown;
      createdAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);

  const client = useMemo(() => {
    try {
      return getAutomataClient();
    } catch {
      return null;
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!automataId || !client) return;

    try {
      setLoading(true);
      setError(null);

      const method =
        direction === 'backtrace'
          ? client.backtrace.bind(client)
          : client.replay.bind(client);

      const result = await method(automataId, { anchor: anchor || undefined, limit });

      setEvents((prev) => [...prev, ...result.events]);
      setHasMore(result.nextAnchor !== null);
      setAnchor(result.nextAnchor);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load history';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [automataId, client, direction, limit, anchor]);

  // Reset and load when automataId changes
  useEffect(() => {
    setEvents([]);
    setAnchor(null);
    setHasMore(false);

    if (automataId) {
      loadMore();
    }
  }, [automataId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { events, loading, error, hasMore, loadMore };
}
