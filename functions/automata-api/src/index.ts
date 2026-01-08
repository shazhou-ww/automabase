import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AuthError } from '@automabase/automata-auth';
import { authenticate } from './utils/auth-middleware';
import { handleListRealms } from './handlers/realm-handlers';
import {
  handleCreateAutomata,
  handleListAutomatas,
  handleGetState,
  handleGetDescriptor,
  handleUpdateAutomata,
} from './handlers/automata-handlers';
import {
  handleSendEvent,
  handleListEvents,
  handleGetEvent,
} from './handlers/event-handlers';
import {
  handleBatchSendEventsToAutomata,
  handleBatchSendEventsToRealm,
  handleBatchGetStates,
} from './handlers/batch-handlers';
import { unauthorized, badRequest, methodNotAllowed, internalError } from './utils/response-helpers';

/**
 * Route matcher for path patterns
 */
function matchRoute(
  path: string,
  method: string,
  routes: Array<{
    pattern: RegExp;
    method: string;
    handler: string;
    params?: string[];
  }>
): { handler: string; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = path.match(route.pattern);
    if (match) {
      const params: Record<string, string> = {};
      if (route.params) {
        route.params.forEach((name, idx) => {
          params[name] = match[idx + 1];
        });
      }
      return { handler: route.handler, params };
    }
  }
  return null;
}

// Route definitions
const routes = [
  // Realm routes
  { pattern: /^\/realms$/, method: 'GET', handler: 'listRealms' },
  { pattern: /^\/realms\/([^/]+)\/automatas$/, method: 'POST', handler: 'createAutomata', params: ['realmId'] },
  { pattern: /^\/realms\/([^/]+)\/automatas$/, method: 'GET', handler: 'listAutomatas', params: ['realmId'] },

  // Automata routes
  { pattern: /^\/automatas\/([^/]+)\/state$/, method: 'GET', handler: 'getState', params: ['automataId'] },
  { pattern: /^\/automatas\/([^/]+)\/descriptor$/, method: 'GET', handler: 'getDescriptor', params: ['automataId'] },
  { pattern: /^\/automatas\/([^/]+)$/, method: 'PATCH', handler: 'updateAutomata', params: ['automataId'] },

  // Event routes
  { pattern: /^\/automatas\/([^/]+)\/events$/, method: 'POST', handler: 'sendEvent', params: ['automataId'] },
  { pattern: /^\/automatas\/([^/]+)\/events$/, method: 'GET', handler: 'listEvents', params: ['automataId'] },
  { pattern: /^\/automatas\/([^/]+)\/events\/([^/]+)$/, method: 'GET', handler: 'getEvent', params: ['automataId', 'version'] },
  
  // Batch routes
  { pattern: /^\/automatas\/([^/]+)\/events\/batch$/, method: 'POST', handler: 'batchSendEventsToAutomata', params: ['automataId'] },
  { pattern: /^\/realms\/([^/]+)\/events\/batch$/, method: 'POST', handler: 'batchSendEventsToRealm', params: ['realmId'] },
  { pattern: /^\/automatas\/batch\/states$/, method: 'POST', handler: 'batchGetStates' },
];

/**
 * Automata API Lambda Handler
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Request:', {
    method: event.httpMethod,
    path: event.path,
    requestId: context.awsRequestId,
  });

  const { httpMethod, path } = event;

  // Match route
  const matched = matchRoute(path, httpMethod, routes);

  if (!matched) {
    // Check if path exists but method is wrong
    const pathExists = routes.some((r) => r.pattern.test(path));
    if (pathExists) {
      return methodNotAllowed(httpMethod);
    }
    return badRequest(`Unknown route: ${httpMethod} ${path}`);
  }

  // Set path parameters from route matching
  event.pathParameters = { ...event.pathParameters, ...matched.params };

  // Authenticate request
  const authResult = await authenticate(event);

  if ('error' in authResult) {
    const error = authResult.error;
    console.error('Authentication failed:', error.message);

    if (error instanceof AuthError) {
      return unauthorized(error.message);
    }
    return internalError('Authentication failed', context.awsRequestId);
  }

  const auth = authResult.context;

  try {
    switch (matched.handler) {
      // Realm handlers
      case 'listRealms':
        return await handleListRealms(event, auth);

      // Automata handlers
      case 'createAutomata':
        return await handleCreateAutomata(event, auth);
      case 'listAutomatas':
        return await handleListAutomatas(event, auth);
      case 'getState':
        return await handleGetState(event, auth);
      case 'getDescriptor':
        return await handleGetDescriptor(event, auth);
      case 'updateAutomata':
        return await handleUpdateAutomata(event, auth);

      // Event handlers
      case 'sendEvent':
        return await handleSendEvent(event, auth);
      case 'listEvents':
        return await handleListEvents(event, auth);
      case 'getEvent':
        return await handleGetEvent(event, auth);

      // Batch handlers
      case 'batchSendEventsToAutomata':
        return await handleBatchSendEventsToAutomata(event, auth);
      case 'batchSendEventsToRealm':
        return await handleBatchSendEventsToRealm(event, auth);
      case 'batchGetStates':
        return await handleBatchGetStates(event, auth);

      default:
        return badRequest(`Unknown handler: ${matched.handler}`);
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return internalError('Internal server error', context.awsRequestId);
  }
};
