/**
 * Realm Entity Types
 * Based on BUSINESS_MODEL_SPEC.md Section 2.4
 *
 * Note: Realm is a logical concept, not stored as an independent entity.
 * - Created implicitly when creating an Automata with a realmId
 * - Used as authorization scope
 * - Queryable via GSI
 */

/**
 * Realm summary (derived from automata data)
 */
export interface RealmSummary {
  /** Realm ID (ULID format) */
  realmId: string;
  /** Count of automatas in this realm */
  automataCount: number;
  /** First automata creation time (derived) */
  createdAt: string;
}

/**
 * List realms response
 */
export interface ListRealmsResponse {
  realms: RealmSummary[];
  nextCursor?: string;
}
