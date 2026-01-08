import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import { handleConnect, handleDisconnect } from './handlers/connection-handlers';
import { handleSubscribe, handleUnsubscribe } from './handlers/subscription-handlers';
import { handleStreamEvent } from './handlers/stream-handlers';

/**
 * Automata WebSocket Lambda Handler
 *
 * Handles:
 * - $connect: WebSocket connection with JWT validation
 * - $disconnect: Connection cleanup
 * - subscribe: Subscribe to automata state updates
 * - unsubscribe: Unsubscribe from automata
 * - DynamoDB Stream: Push state updates to subscribers
 */
export const handler = async (
  event: APIGatewayProxyWebsocketEventV2 | DynamoDBStreamEvent
): Promise<APIGatewayProxyResultV2 | void> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  // Check if this is a DynamoDB Stream event
  if ('Records' in event && event.Records?.[0]?.eventSource === 'aws:dynamodb') {
    await handleStreamEvent(event as DynamoDBStreamEvent);
    return;
  }

  // WebSocket event
  const wsEvent = event as APIGatewayProxyWebsocketEventV2;
  const routeKey = wsEvent.requestContext.routeKey;

  console.log('Route:', routeKey);

  switch (routeKey) {
    case '$connect':
      return handleConnect(wsEvent);

    case '$disconnect':
      return handleDisconnect(wsEvent);

    case 'subscribe':
      return handleSubscribe(wsEvent);

    case 'unsubscribe':
      return handleUnsubscribe(wsEvent);

    default:
      // Handle message body to determine action
      try {
        const body = JSON.parse(wsEvent.body ?? '{}');
        const action = body.action;

        switch (action) {
          case 'subscribe':
            return handleSubscribe(wsEvent);
          case 'unsubscribe':
            return handleUnsubscribe(wsEvent);
          default:
            console.log('Unknown action:', action);
            return { statusCode: 400, body: `Unknown action: ${action}` };
        }
      } catch {
        console.log('Invalid message format');
        return { statusCode: 400, body: 'Invalid message format' };
      }
  }
};
