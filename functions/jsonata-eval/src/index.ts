import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import jsonata from 'jsonata';

interface RequestBody {
  data: unknown;
  function: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const body: RequestBody = JSON.parse(event.body);

    if (body.function === undefined || body.function === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'function is required' }),
      };
    }

    const expression = jsonata(body.function);
    const result = await expression.evaluate(body.data);

    return {
      statusCode: 200,
      body: JSON.stringify({ data: result }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      statusCode: 400,
      body: JSON.stringify({ error: message }),
    };
  }
};
