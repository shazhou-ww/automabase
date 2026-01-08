/**
 * Event Entity Types
 * Based on BUSINESS_MODEL_SPEC.md Section 2.3
 */

/**
 * Event entity - triggers state transitions (immutable record)
 */
export interface AutomataEvent {
  /** Owning automata ID (composite key part 1) */
  automataId: string;
  /** Base version (composite key part 2, 6-digit Base62) */
  baseVersion: string;
  /** Event type */
  eventType: string;
  /** Event payload data */
  eventData: unknown;
  /** Sender Subject ID */
  senderSubjectId: string;
  /** Event timestamp (ISO8601) */
  timestamp: string;
}

/**
 * Event ID format: event:{automataId}:{baseVersion}
 */
export function createEventId(automataId: string, baseVersion: string): string {
  return `event:${automataId}:${baseVersion}`;
}

/**
 * Parse event ID into components
 */
export function parseEventId(eventId: string): { automataId: string; baseVersion: string } | null {
  const parts = eventId.split(':');
  if (parts.length !== 3 || parts[0] !== 'event') {
    return null;
  }
  return { automataId: parts[1], baseVersion: parts[2] };
}

/**
 * Send event request
 */
export interface SendEventRequest {
  eventType: string;
  eventData: unknown;
}

/**
 * Send event response
 */
export interface SendEventResponse {
  eventId: string;
  baseVersion: string;
  newVersion: string;
  newState: unknown;
  timestamp: string;
  /** Only included when ?include=oldState */
  oldState?: unknown;
}

/**
 * Event list item
 */
export interface EventListItem {
  eventId: string;
  baseVersion: string;
  eventType: string;
  eventData: unknown;
  senderSubjectId: string;
  timestamp: string;
}

/**
 * Query direction for event listing
 */
export type EventQueryDirection = 'forward' | 'backward';

/**
 * List events request params
 */
export interface ListEventsParams {
  /** Query direction: forward (old to new) or backward (new to old) */
  direction?: EventQueryDirection;
  /** Starting version (optional, defaults to start/end) */
  anchor?: string;
  /** Limit (default 100, max 1000) */
  limit?: number;
}

/**
 * List events response
 */
export interface ListEventsResponse {
  events: EventListItem[];
  nextAnchor?: string;
}

/**
 * Single event response
 */
export interface EventResponse {
  eventId: string;
  automataId: string;
  baseVersion: string;
  eventType: string;
  eventData: unknown;
  senderSubjectId: string;
  timestamp: string;
}

/**
 * Batch send events to a single automata
 * Events are processed sequentially
 */
export interface BatchSendEventsToAutomataRequest {
  automataId: string;
  events: SendEventRequest[];
}

/**
 * Batch send events to multiple automatas in the same realm
 */
export interface BatchSendEventsToRealmRequest {
  realmId: string;
  automatas: Array<{
    automataId: string;
    events: SendEventRequest[];
  }>;
}

/**
 * Result for a single event in batch operation
 */
export interface BatchEventResult {
  success: boolean;
  eventIndex: number;
  eventId?: string;
  baseVersion?: string;
  newVersion?: string;
  newState?: unknown;
  error?: string;
}

/**
 * Result for batch events to a single automata
 */
export interface BatchSendEventsToAutomataResponse {
  automataId: string;
  results: BatchEventResult[];
  /** Index of the last successful event (inclusive), -1 if all failed */
  lastSuccessfulIndex: number;
  /** Total number of events processed */
  totalEvents: number;
  /** Number of successful events */
  successfulCount: number;
  /** Number of failed events */
  failedCount: number;
}

/**
 * Result for batch events to multiple automatas
 */
export interface BatchSendEventsToRealmResponse {
  realmId: string;
  automatas: Array<{
    automataId: string;
    results: BatchEventResult[];
    lastSuccessfulIndex: number;
    successfulCount: number;
    failedCount: number;
  }>;
  /** Total number of automatas processed */
  totalAutomatas: number;
  /** Number of automatas with all events successful */
  fullySuccessfulAutomatas: number;
  /** Number of automatas with at least one failure */
  partiallyFailedAutomatas: number;
}

/**
 * Batch get states request
 */
export interface BatchGetStatesRequest {
  automataIds: string[];
}

/**
 * Batch get states response item
 */
export interface BatchStateResult {
  automataId: string;
  success: boolean;
  state?: AutomataStateResponse;
  error?: string;
}

/**
 * Batch get states response
 */
export interface BatchGetStatesResponse {
  results: BatchStateResult[];
  successfulCount: number;
  failedCount: number;
}