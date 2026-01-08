import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Tenant API Lambda Handler
 *
 * Routes:
 * - GET /tenant - Read tenant info
 * - PATCH /tenant - Update tenant info
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { httpMethod } = event;

  // TODO: Implement handlers based on BUSINESS_MODEL_SPEC.md
  // - Extract tenantId from JWT iss claim
  // - Verify tenant:xxx:read or tenant:xxx:readwrite permission

  switch (httpMethod) {
    case 'GET':
      // TODO: Implement GET /tenant
      return {
        statusCode: 501,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'GET /tenant: Not implemented yet',
          requestId: context.awsRequestId,
        }),
      };

    case 'PATCH':
      // TODO: Implement PATCH /tenant
      return {
        statusCode: 501,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'PATCH /tenant: Not implemented yet',
          requestId: context.awsRequestId,
        }),
      };

    default:
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Method ${httpMethod} not allowed`,
          requestId: context.awsRequestId,
        }),
      };
  }
};
