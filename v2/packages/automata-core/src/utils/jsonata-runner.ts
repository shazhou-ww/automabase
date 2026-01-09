/**
 * JSONata expression runner for state transitions
 * Shared utility for both API and WebSocket handlers
 */

import jsonata from 'jsonata';

/**
 * Context passed to JSONata transition expressions
 */
interface TransitionContext {
  /** Current state before transition */
  $$: unknown;
  /** Event being processed */
  $event: {
    type: string;
    data: unknown;
  };
}

/**
 * Execute a JSONata transition expression
 *
 * @param expression - JSONata expression string
 * @param currentState - Current automata state
 * @param eventType - Event type
 * @param eventData - Event data
 * @returns New state after transition
 */
export async function executeTransition(
  expression: string,
  currentState: unknown,
  eventType: string,
  eventData: unknown
): Promise<unknown> {
  const compiled = jsonata(expression);

  // Build context with $$ (current state) and $event
  const context: TransitionContext = {
    $$: currentState,
    $event: {
      type: eventType,
      data: eventData,
    },
  };

  // Bind $$ and $event to the expression
  compiled.registerFunction('$$', () => currentState);

  // Evaluate with bindings
  const result = await compiled.evaluate(currentState, {
    $$: currentState,
    $event: context.$event,
  });

  return result;
}
