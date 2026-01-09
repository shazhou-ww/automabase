/**
 * Automata API Client
 * Uses JWT authentication with automatic token refresh
 */

import { getAuthorizationHeader } from '../auth/token-manager';
import { getApiUrl } from '../config/config-manager';
import { getCurrentProfile } from '../config/profile-manager';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AutomataDescriptor {
  name: string;
  stateSchema: unknown;
  eventSchemas: Record<string, unknown>;
  transition: string;
  initialState: unknown;
}

export interface Automata {
  automataId: string;
  tenantId: string;
  realmId: string;
  descriptor: AutomataDescriptor;
  descriptorHash: string;
  currentState: unknown;
  version: string;
  status: 'active' | 'archived';
  creatorSubjectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomataState {
  automataId: string;
  currentState: unknown;
  version: string;
  status: string;
  updatedAt: string;
}

export interface AutomataEvent {
  eventId: string;
  automataId: string;
  baseVersion: string;
  eventType: string;
  eventData: unknown;
  senderSubjectId: string;
  timestamp: string;
}

export interface SendEventResponse {
  eventId: string;
  baseVersion: string;
  newVersion: string;
  newState: unknown;
  oldState?: unknown;
  timestamp: string;
}

export interface RealmSummary {
  realmId: string;
  automataCount: number;
  createdAt: string;
}

export class AutomataApiClient {
  private baseUrl: string;
  private profileName: string;

  constructor(profileName?: string, baseUrl?: string) {
    this.baseUrl = (baseUrl || getApiUrl() || '').replace(/\/$/, '');

    if (!this.baseUrl) {
      throw new Error('API URL not configured. Run: automa config set api.url <url>');
    }

    const profile = getCurrentProfile(profileName);
    if (!profile) {
      throw new Error('No profile configured. Run: automa profile add <name> to add a profile');
    }

    this.profileName = profile.name;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const authHeader = await getAuthorizationHeader(this.profileName);

    if (!authHeader) {
      throw new Error(`Not logged in. Run: automa profile login ${this.profileName}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const result = (await response.json()) as ApiResponse<T>;

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Request failed: ${response.status}`);
    }

    return result.data as T;
  }

  // Realm operations
  async listRealms(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<{ realms: RealmSummary[]; nextCursor?: string }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);

    const query = params.toString();
    return this.request('GET', `/realms${query ? `?${query}` : ''}`);
  }

  // Automata operations
  async createAutomata(
    realmId: string,
    request: {
      descriptor: AutomataDescriptor;
      descriptorSignature: string;
    }
  ): Promise<{ automataId: string; createdAt: string }> {
    return this.request('POST', `/realms/${encodeURIComponent(realmId)}/automatas`, request);
  }

  async listAutomatas(
    realmId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ automatas: Automata[]; nextCursor?: string }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);

    const query = params.toString();
    return this.request(
      'GET',
      `/realms/${encodeURIComponent(realmId)}/automatas${query ? `?${query}` : ''}`
    );
  }

  async getState(automataId: string): Promise<AutomataState> {
    return this.request('GET', `/automatas/${encodeURIComponent(automataId)}/state`);
  }

  async getDescriptor(automataId: string): Promise<{
    automataId: string;
    tenantId: string;
    realmId: string;
    descriptor: AutomataDescriptor;
    descriptorHash: string;
    creatorSubjectId: string;
    createdAt: string;
  }> {
    return this.request('GET', `/automatas/${encodeURIComponent(automataId)}/descriptor`);
  }

  async archiveAutomata(automataId: string): Promise<{
    automataId: string;
    status: string;
    updatedAt: string;
  }> {
    return this.request('PATCH', `/automatas/${encodeURIComponent(automataId)}`, {
      status: 'archived',
    });
  }

  // Event operations
  async sendEvent(
    automataId: string,
    eventType: string,
    eventData?: unknown
  ): Promise<SendEventResponse> {
    return this.request('POST', `/automatas/${encodeURIComponent(automataId)}/events`, {
      eventType,
      eventData,
    });
  }

  async listEvents(
    automataId: string,
    options?: {
      direction?: 'forward' | 'backward';
      anchor?: string;
      limit?: number;
    }
  ): Promise<{ events: AutomataEvent[]; nextAnchor?: string }> {
    const params = new URLSearchParams();
    if (options?.direction) params.set('direction', options.direction);
    if (options?.anchor) params.set('anchor', options.anchor);
    if (options?.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    return this.request(
      'GET',
      `/automatas/${encodeURIComponent(automataId)}/events${query ? `?${query}` : ''}`
    );
  }

  async getEvent(automataId: string, version: string): Promise<AutomataEvent> {
    return this.request(
      'GET',
      `/automatas/${encodeURIComponent(automataId)}/events/${encodeURIComponent(version)}`
    );
  }

  // History operations
  async getHistoricalState(
    automataId: string,
    version: string
  ): Promise<{
    automataId: string;
    version: string;
    state: unknown;
    isSnapshot: boolean;
    timestamp: string;
  }> {
    return this.request(
      'GET',
      `/automatas/${encodeURIComponent(automataId)}/history/${encodeURIComponent(version)}`
    );
  }

  async listSnapshots(
    automataId: string,
    options?: { limit?: number; startVersion?: string }
  ): Promise<{
    automataId: string;
    snapshots: Array<{ version: string; state: unknown; createdAt: string }>;
  }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.startVersion) params.set('startVersion', options.startVersion);

    const query = params.toString();
    return this.request(
      'GET',
      `/automatas/${encodeURIComponent(automataId)}/snapshots${query ? `?${query}` : ''}`
    );
  }

  // Batch operations
  async batchSendEvents(
    automataId: string,
    events: Array<{ eventType: string; eventData?: unknown }>
  ): Promise<{
    automataId: string;
    results: Array<{
      success: boolean;
      eventIndex: number;
      eventId?: string;
      error?: string;
    }>;
    successfulCount: number;
    failedCount: number;
  }> {
    return this.request('POST', `/automatas/${encodeURIComponent(automataId)}/events/batch`, {
      automataId,
      events,
    });
  }

  async batchGetStates(automataIds: string[]): Promise<{
    results: Array<{
      automataId: string;
      success: boolean;
      state?: AutomataState;
      error?: string;
    }>;
    successfulCount: number;
    failedCount: number;
  }> {
    return this.request('POST', '/automatas/batch/states', { automataIds });
  }

  // Tenant info
  async getTenantInfo(): Promise<{
    tenantId: string;
    name: string;
    status: string;
    jwksUri: string;
    contactName?: string;
    contactEmail?: string;
    createdAt: string;
    updatedAt?: string;
  }> {
    return this.request('GET', '/tenant');
  }
}
