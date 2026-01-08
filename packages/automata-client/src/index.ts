/**
 * @automabase/automata-client
 *
 * Frontend SDK for automata management with:
 * - REST API + WebSocket real-time tracking in one client
 * - IndexedDB caching via withStore() decorator
 * - React hooks for easy integration
 *
 * @example
 * ```typescript
 * import {
 *   AutomataClient,
 *   withStore,
 *   setAutomataClient,
 *   useAutomata,
 * } from '@automabase/automata-client';
 *
 * // Initialize (once at app startup)
 * const client = new AutomataClient({
 *   baseUrl: 'https://api.example.com',
 *   wsUrl: 'wss://ws.example.com/prod',  // optional, for real-time
 * });
 *
 * // Add local caching (optional)
 * const cachedClient = withStore(client);
 *
 * // Set as global client for hooks
 * setAutomataClient(cachedClient);
 *
 * // In React component
 * function Counter({ id }: { id: string }) {
 *   const { state, send, loading, connected } = useAutomata<{ count: number }>(id);
 *
 *   if (loading) return <div>Loading...</div>;
 *
 *   return (
 *     <div>
 *       <p>Count: {state?.count}</p>
 *       <button onClick={() => send('INCREMENT')}>+</button>
 *       <p>{connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
 *     </div>
 *   );
 * }
 * ```
 */

// Client (REST API + WebSocket)
export { AutomataClient, type AutomataClientConfig } from './client';
// React Hooks
export {
  getAutomataClient,
  setAutomataClient,
  useAutomata,
  useAutomataHistory,
  useCreateAutomata,
  useDeleteAutomata,
} from './hooks';

// Store & withStore decorator
export {
  AutomataStore,
  automataStore,
  type CachedAutomataClient,
  withStore,
} from './store';
// Types
export type {
  ApiResponse,
  AutomataEvent,
  AutomataListItem,
  AutomataMeta,
  CreateAutomataRequest,
  ErrorMessage,
  EventListResult,
  ListAutomataOptions,
  ListAutomataResult,
  PostEventRequest,
  PostEventResponse,
  StateUpdateMessage,
  StoredAutomata,
  SubscribedMessage,
  TrackerCallbacks,
  UseAutomataOptions,
  UseAutomataResult,
  WebSocketMessage,
} from './types';
