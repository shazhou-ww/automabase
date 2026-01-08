import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  DynamoDBStreamEvent,
} from 'aws-lambda';

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
    // TODO: Handle DynamoDB Stream events - push updates to subscribers
    console.log('DynamoDB Stream event - not implemented yet');
    return;
  }

  // WebSocket event
  const wsEvent = event as APIGatewayProxyWebsocketEventV2;
  const routeKey = wsEvent.requestContext.routeKey;

  // TODO: Implement routing based on BUSINESS_MODEL_SPEC.md

  switch (routeKey) {
    case '$connect':
      console.log('Connection event - not implemented yet');
      return { statusCode: 200, body: 'Connected' };

    case '$disconnect':
      console.log('Disconnection event - not implemented yet');
      return { statusCode: 200, body: 'Disconnected' };

    default:
      console.log(`Route ${routeKey} - not implemented yet`);
      return { statusCode: 501, body: 'Not implemented' };
  }
};
