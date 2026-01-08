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
