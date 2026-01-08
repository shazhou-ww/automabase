import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Automata API Lambda Handler
 *
 * Routes:
 * - POST /realms/{realmId}/automatas - Create automata
 * - GET /realms - List realms
 * - GET /realms/{realmId}/automatas - List automatas in realm
 * - GET /automatas/{automataId}/state - Get automata state
 * - GET /automatas/{automataId}/descriptor - Get automata descriptor
 * - PATCH /automatas/{automataId} - Update automata (archive)
 * - POST /automatas/{automataId}/events - Send event
 * - GET /automatas/{automataId}/events - List events
 * - GET /automatas/{automataId}/events/{version} - Get single event
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { httpMethod, path, pathParameters } = event;

  // TODO: Implement routing and handlers based on BUSINESS_MODEL_SPEC.md

  return {
    statusCode: 501,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'automata-api: Not implemented yet',
      method: httpMethod,
      path,
      pathParameters,
      requestId: context.awsRequestId,
    }),
  };
};
