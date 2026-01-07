import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error } from './utils/response-helpers';
import {
  listAutomata,
  createAutomata,
  getAutomata,
  deleteAutomata,
  postEvent,
  getEvent,
  backtrace,
  replay,
} from './handlers/automata-handlers';

/**
 * Main handler - routes requests to appropriate handlers
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method = event.httpMethod;
    const path = event.resource;

    // Automata routes (JWT auth required)
    if (method === 'GET' && path === '/automata') {
      return await listAutomata(event);
    }

    if (method === 'POST' && path === '/automata') {
      return await createAutomata(event);
    }

    if (method === 'GET' && path === '/automata/{automataId}') {
      return await getAutomata(event);
    }

    if (method === 'DELETE' && path === '/automata/{automataId}') {
      return await deleteAutomata(event);
    }

    if (method === 'POST' && path === '/automata/{automataId}/events') {
      return await postEvent(event);
    }

    if (method === 'GET' && path === '/automata/{automataId}/events/{version}') {
      return await getEvent(event);
    }

    if (method === 'GET' && path === '/automata/{automataId}/backtrace') {
      return await backtrace(event);
    }

    if (method === 'GET' && path === '/automata/{automataId}/replay') {
      return await replay(event);
    }

    return error(`Unknown route: ${method} ${path}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Handler error:', err);
    return error(message);
  }
};
