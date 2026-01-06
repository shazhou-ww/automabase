/**
 * Automata Client Types
 */

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Automata metadata
export interface AutomataMeta {
  id: string;
  version: string;
  state: unknown;
  initialState: unknown;
  stateSchema: unknown;
  eventSchemas: Record<string, unknown>;
  transition: string;
  createdAt: string;
  updatedAt: string;
}

// Event record
export interface AutomataEvent {
  version: string;
  type: string;
  data: unknown;
  nextState: unknown;
  createdAt: string;
}

// Backtrace/Replay result
export interface EventListResult {
  events: AutomataEvent[];
  nextAnchor: string | null;
}

// Create automata request
export interface CreateAutomataRequest {
  stateSchema: unknown;
  eventSchemas: Record<string, unknown>;
  initialState: unknown;
  transition: string;
}

// Post event request
export interface PostEventRequest {
  type: string;
  data?: unknown;
}

// Post event response
export interface PostEventResponse {
  version: string;
  state: unknown;
}

// WebSocket message types
export interface SubscribedMessage {
  type: 'subscribed';
  automataId: string;
  state: unknown;
  version: string;
  timestamp: string;
}

export interface StateUpdateMessage {
  type: 'state';
  automataId: string;
  event: {
    type: string;
    data: unknown;
  };
  state: unknown;
  version: string;
  timestamp: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type WebSocketMessage = SubscribedMessage | StateUpdateMessage | ErrorMessage;

// Tracker event callbacks
export interface TrackerCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onSubscribed?: (automataId: string, state: unknown, version: string) => void;
  onStateUpdate?: (automataId: string, event: { type: string; data: unknown }, state: unknown, version: string, timestamp: string) => void;
  onError?: (message: string) => void;
}

// Local storage record
export interface StoredAutomata {
  id: string;
  version: string;
  state: unknown;
  meta?: AutomataMeta;
  syncedAt: string;
}

// useAutomata hook options
export interface UseAutomataOptions {
  /** Auto-subscribe to real-time updates */
  subscribe?: boolean;
  /** Use local IndexedDB cache */
  useLocalCache?: boolean;
  /** Callback when state changes */
  onStateChange?: (state: unknown, version: string) => void;
}

// useAutomata hook return type
export interface UseAutomataResult<TState = unknown> {
  /** Current state */
  state: TState | null;
  /** Current version */
  version: string | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Connection status */
  connected: boolean;
  /** Send an event */
  send: (type: string, data?: unknown) => Promise<PostEventResponse | null>;
  /** Refresh from server */
  refresh: () => Promise<void>;
}
