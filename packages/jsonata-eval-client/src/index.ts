import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';

/**
 * Environment variable name for the jsonata-eval Lambda function
 */
const ENV_FUNCTION_NAME = 'JSONATA_EVAL_FUNCTION';

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 10000;

/**
 * Options for invoking the jsonata-eval Lambda function
 */
export interface JsonataEvalOptions {
  /**
   * The Lambda function name or ARN (optional)
   * - Defaults to environment variable `JSONATA_EVAL_FUNCTION`
   * - For AWS: CloudFormation resolves !Ref to actual function name
   * - For SAM Local: resolves to logical function name (e.g., 'JsonataEvalFunction')
   */
  functionName?: string;

  /**
   * Timeout in milliseconds for the JSONata evaluation (default: 10000ms)
   * Note: This is passed to the Lambda function, not the HTTP timeout
   */
  timeout?: number;
}

/**
 * Input for jsonata evaluation
 */
export interface JsonataEvalInput {
  /**
   * The JSONata expression to evaluate
   */
  function: string;

  /**
   * The data to evaluate the expression against
   */
  data: unknown;
}

/**
 * Successful result from jsonata evaluation
 */
export interface JsonataEvalSuccessResult {
  success: true;
  data: unknown;
}

/**
 * Failed result from jsonata evaluation
 */
export interface JsonataEvalErrorResult {
  success: false;
  error: string;
}

/**
 * Result type for jsonata evaluation
 */
export type JsonataEvalResult = JsonataEvalSuccessResult | JsonataEvalErrorResult;

/**
 * Response body from the Lambda function
 */
interface LambdaResponseBody {
  data?: unknown;
  error?: string;
}

/**
 * Invokes the jsonata-eval Lambda function to evaluate a JSONata expression
 *
 * @param client - The LambdaClient instance (created and managed by caller)
 * @param input - The JSONata expression and data to evaluate
 * @param options - Optional configuration (functionName, timeout)
 * @returns A promise that resolves to either a success or error result
 *
 * @example
 * ```typescript
 * import { LambdaClient } from '@aws-sdk/client-lambda';
 * import { jsonataEval } from '@automabase/jsonata-eval-client';
 *
 * // Create client once, reuse for multiple calls
 * const client = new LambdaClient({ region: 'us-east-1' });
 *
 * // For SAM Local
 * const localClient = new LambdaClient({ endpoint: 'http://127.0.0.1:3001' });
 *
 * // Using environment variable JSONATA_EVAL_FUNCTION
 * const result = await jsonataEval(client, {
 *   function: '$.name',
 *   data: { name: 'John', age: 30 }
 * });
 *
 * // With explicit function name
 * const result = await jsonataEval(client, {
 *   function: '$.name',
 *   data: { name: 'John' }
 * }, { functionName: 'my-custom-function' });
 *
 * if (result.success) {
 *   console.log(result.data); // 'John'
 * } else {
 *   console.error(result.error);
 * }
 *
 * // Don't forget to destroy client when done
 * client.destroy();
 * ```
 */
export async function jsonataEval(
  client: LambdaClient,
  input: JsonataEvalInput,
  options: JsonataEvalOptions = {}
): Promise<JsonataEvalResult> {
  const { timeout = DEFAULT_TIMEOUT } = options;
  const functionName = options.functionName ?? process.env[ENV_FUNCTION_NAME];

  if (!functionName) {
    return {
      success: false,
      error: `Function name not provided. Set ${ENV_FUNCTION_NAME} environment variable or pass functionName option.`,
    };
  }

  try {
    const payload = JSON.stringify({
      body: JSON.stringify({
        function: input.function,
        data: input.data,
        timeout,
      }),
    });

    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: new TextEncoder().encode(payload),
    });

    const response = await client.send(command);

    if (response.FunctionError) {
      return {
        success: false,
        error: `Lambda execution error: ${response.FunctionError}`,
      };
    }

    if (!response.Payload) {
      return {
        success: false,
        error: 'No payload returned from Lambda',
      };
    }

    const responsePayload = JSON.parse(new TextDecoder().decode(response.Payload));

    // Lambda returns APIGatewayProxyResult format
    if (responsePayload.statusCode !== 200) {
      const body: LambdaResponseBody = JSON.parse(responsePayload.body || '{}');
      return {
        success: false,
        error: body.error || `Lambda returned status ${responsePayload.statusCode}`,
      };
    }

    const body: LambdaResponseBody = JSON.parse(responsePayload.body || '{}');

    return {
      success: true,
      data: body.data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: message,
    };
  }
}
