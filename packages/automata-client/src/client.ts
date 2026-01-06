/**
 * Automata Client
 * Unified client for REST API and WebSocket real-time tracking
 */

import type {
  ApiResponse,
  AutomataMeta,
  CreateAutomataRequest,
  EventListResult,
  PostEventRequest,
  PostEventResponse,
  AutomataEvent,
  TrackerCallbacks,
  WebSocketMessage,
  SubscribedMessage,
  StateUpdateMessage,
  ListAutomataResult,
  ListAutomataOptions,
} from './types';

export interface AutomataClientConfig {
  /** Base URL for the REST API (e.g., https://api.example.com) */
  baseUrl: string;
  /** WebSocket URL for real-time tracking (optional, e.g., wss://xxx.execute-api.region.amazonaws.com/prod) */
  wsUrl?: string;
  /** Optional fetch implementation (defaults to global fetch) */
  fetch?: typeof fetch;
  /** Optional headers to include in all requests */
  headers?: Record<string, string>;
  /** Function to get JWT token for authentication (called before each request) */
  getToken?: () => string | Promise<string>;
  /** Auto-reconnect WebSocket on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect interval in ms (default: 3000) */
  reconnectInterval?: number;
  /** Max reconnect attempts (default: 10, -1 for infinite) */
  maxReconnectAttempts?: number;
}

type SubscriptionCallback = (
  state: unknown,
  version: string,
  event?: { type: string; data: unknown },
  timestamp?: string
) => void;

interface Subscription {
  automataId: string;
  callbacks: Set<SubscriptionCallback>;
  currentState?: unknown;
  currentVersion?: string;
}

export class AutomataClient {
  private baseUrl: string;
  private fetchFn: typeof fetch;
  private headers: Record<string, string>;
  private getTokenFn?: () => string | Promise<string>;

  // WebSocket tracking
  private wsUrl?: string;
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Subscription>();
  private pendingSubscriptions = new Set<string>();
  private trackerCallbacks: TrackerCallbacks = {};
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private shouldReconnect = true;
  private autoReconnect: boolean;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;

  constructor(config: AutomataClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.fetchFn = config.fetch || globalThis.fetch.bind(globalThis);
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.getTokenFn = config.getToken;
    this.wsUrl = config.wsUrl;
    this.autoReconnect = config.autoReconnect ?? true;
    this.reconnectInterval = config.reconnectInterval ?? 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
  }

  // ============ REST API Methods ============

  /**
   * Get headers with Authorization token if getToken is configured
   */
  private async getRequestHeaders(): Promise<Record<string, string>> {
    if (!this.getTokenFn) {
      return this.headers;
    }

    const token = await this.getTokenFn();
    return {
      ...this.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers = await this.getRequestHeaders();
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const result: ApiResponse<T> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Request failed');
    }

    return result.data as T;
  }

  /**
   * Create a new automata
   */
  async create(request: CreateAutomataRequest): Promise<{ id: string }> {
    return this.request<{ id: string }>('POST', '/automata', request);
  }

  /**
   * Get an automata by ID
   */
  async get(automataId: string): Promise<AutomataMeta> {
    return this.request<AutomataMeta>('GET', `/automata/${encodeURIComponent(automataId)}`);
  }

  /**
   * Delete an automata
   */
  async delete(automataId: string): Promise<void> {
    await this.request<void>('DELETE', `/automata/${encodeURIComponent(automataId)}`);
  }

  /**
   * Post an event to an automata (trigger state transition)
   */
  async postEvent(
    automataId: string,
    event: PostEventRequest
  ): Promise<PostEventResponse> {
    return this.request<PostEventResponse>(
      'POST',
      `/automata/${encodeURIComponent(automataId)}/events`,
      event
    );
  }

  /**
   * Get a specific event by version
   */
  async getEvent(automataId: string, version: string): Promise<AutomataEvent> {
    return this.request<AutomataEvent>(
      'GET',
      `/automata/${encodeURIComponent(automataId)}/events/${encodeURIComponent(version)}`
    );
  }

  /**
   * Backtrace events (newest to oldest)
   */
  async backtrace(
    automataId: string,
    options?: { anchor?: string; limit?: number }
  ): Promise<EventListResult> {
    const params = new URLSearchParams();
    if (options?.anchor) params.set('anchor', options.anchor);
    if (options?.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    const path = `/automata/${encodeURIComponent(automataId)}/backtrace${query ? `?${query}` : ''}`;

    return this.request<EventListResult>('GET', path);
  }

  /**
   * Replay events (oldest to newest)
   */
  async replay(
    automataId: string,
    options?: { anchor?: string; limit?: number }
  ): Promise<EventListResult> {
    const params = new URLSearchParams();
    if (options?.anchor) params.set('anchor', options.anchor);
    if (options?.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    const path = `/automata/${encodeURIComponent(automataId)}/replay${query ? `?${query}` : ''}`;

    return this.request<EventListResult>('GET', path);
  }

  /**
   * List all automata for the current user
   */
  async list(options?: ListAutomataOptions): Promise<ListAutomataResult> {
    const params = new URLSearchParams();
    if (options?.anchor) params.set('anchor', options.anchor);
    if (options?.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    const path = `/automata${query ? `?${query}` : ''}`;

    return this.request<ListAutomataResult>('GET', path);
  }

  // ============ WebSocket Tracking Methods ============

  /**
   * Check if WebSocket tracking is enabled
   */
  get trackingEnabled(): boolean {
    return !!this.wsUrl;
  }

  /**
   * Check if WebSocket is connected
   */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Set global tracker callbacks
   */
  setTrackerCallbacks(callbacks: TrackerCallbacks): void {
    this.trackerCallbacks = callbacks;
  }

  /**
   * Connect to WebSocket server for real-time tracking
   * If getToken is configured, token will be appended to WebSocket URL as query parameter
   */
  async connect(): Promise<void> {
    if (!this.wsUrl) {
      throw new Error('WebSocket URL not configured');
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            resolve();
          } else if (!this.isConnecting) {
            reject(new Error('Connection failed'));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    // Build WebSocket URL with token if getToken is configured
    let wsUrlWithToken = this.wsUrl;
    if (this.getTokenFn) {
      const token = await this.getTokenFn();
      const url = new URL(this.wsUrl);
      url.searchParams.set('token', token);
      wsUrlWithToken = url.toString();
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrlWithToken);
      } catch (err) {
        this.isConnecting = false;
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.trackerCallbacks.onConnected?.();

        // Re-subscribe to all existing subscriptions
        for (const automataId of this.subscriptions.keys()) {
          this.sendSubscribe(automataId);
        }

        // Subscribe to pending subscriptions
        for (const automataId of this.pendingSubscriptions) {
          this.sendSubscribe(automataId);
        }
        this.pendingSubscriptions.clear();

        resolve();
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.trackerCallbacks.onDisconnected?.();

        if (this.shouldReconnect && this.autoReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        if (this.isConnecting) {
          this.isConnecting = false;
          reject(new Error('WebSocket connection error'));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to an automata's state changes (real-time)
   */
  subscribe(
    automataId: string,
    callback: SubscriptionCallback
  ): () => void {
    if (!this.wsUrl) {
      console.warn('WebSocket URL not configured, subscription will not work');
    }

    let subscription = this.subscriptions.get(automataId);

    if (!subscription) {
      subscription = {
        automataId,
        callbacks: new Set(),
      };
      this.subscriptions.set(automataId, subscription);

      if (this.connected) {
        this.sendSubscribe(automataId);
      } else {
        this.pendingSubscriptions.add(automataId);
        // Auto-connect if not connected
        if (this.wsUrl) {
          this.connect().catch(console.error);
        }
      }
    }

    subscription.callbacks.add(callback);

    // If we already have state, call callback immediately
    if (subscription.currentState !== undefined && subscription.currentVersion) {
      callback(subscription.currentState, subscription.currentVersion);
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(automataId, callback);
    };
  }

  /**
   * Unsubscribe from an automata
   */
  unsubscribe(automataId: string, callback?: SubscriptionCallback): void {
    const subscription = this.subscriptions.get(automataId);
    if (!subscription) return;

    if (callback) {
      subscription.callbacks.delete(callback);
    }

    // If no more callbacks, remove subscription entirely
    if (!callback || subscription.callbacks.size === 0) {
      this.subscriptions.delete(automataId);
      this.pendingSubscriptions.delete(automataId);

      if (this.connected) {
        this.sendUnsubscribe(automataId);
      }
    }
  }

  /**
   * Get current cached state for a subscribed automata
   */
  getSubscribedState(automataId: string): { state: unknown; version: string } | null {
    const subscription = this.subscriptions.get(automataId);
    if (!subscription || subscription.currentState === undefined) {
      return null;
    }
    return {
      state: subscription.currentState,
      version: subscription.currentVersion!,
    };
  }

  private sendSubscribe(automataId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      action: 'subscribe',
      automataId,
    }));
  }

  private sendUnsubscribe(automataId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      action: 'unsubscribe',
      automataId,
    }));
  }

  private handleMessage(data: string): void {
    let message: WebSocketMessage;
    try {
      message = JSON.parse(data);
    } catch {
      console.error('Invalid WebSocket message:', data);
      return;
    }

    switch (message.type) {
      case 'subscribed':
        this.handleSubscribed(message);
        break;
      case 'state':
        this.handleStateUpdate(message);
        break;
      case 'error':
        this.trackerCallbacks.onError?.(message.message);
        break;
    }
  }

  private handleSubscribed(message: SubscribedMessage): void {
    const subscription = this.subscriptions.get(message.automataId);
    if (!subscription) return;

    subscription.currentState = message.state;
    subscription.currentVersion = message.version;

    this.trackerCallbacks.onSubscribed?.(
      message.automataId,
      message.state,
      message.version
    );

    for (const callback of subscription.callbacks) {
      callback(message.state, message.version);
    }
  }

  private handleStateUpdate(message: StateUpdateMessage): void {
    const subscription = this.subscriptions.get(message.automataId);
    if (!subscription) return;

    subscription.currentState = message.state;
    subscription.currentVersion = message.version;

    this.trackerCallbacks.onStateUpdate?.(
      message.automataId,
      message.event,
      message.state,
      message.version,
      message.timestamp
    );

    for (const callback of subscription.callbacks) {
      callback(message.state, message.version, message.event, message.timestamp);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const maxAttempts = this.maxReconnectAttempts;
    if (maxAttempts !== -1 && this.reconnectAttempts >= maxAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(console.error);
    }, delay);
  }
}
