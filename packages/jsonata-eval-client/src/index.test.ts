import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { jsonataEval } from './index';

// Mock the AWS SDK Lambda client
vi.mock('@aws-sdk/client-lambda', () => {
  return {
    InvokeCommand: vi.fn().mockImplementation((params) => params),
  };
});

describe('jsonataEval', () => {
  let mockClient: { send: Mock };
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, JSONATA_EVAL_FUNCTION: 'TestFunction' };
    mockClient = { send: vi.fn() };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return success result when Lambda returns valid data', async () => {
    const responseBody = JSON.stringify({ data: 'John' });
    const lambdaResponse = {
      statusCode: 200,
      body: responseBody,
    };

    mockClient.send.mockResolvedValueOnce({
      Payload: new TextEncoder().encode(JSON.stringify(lambdaResponse)),
    });

    const result = await jsonataEval(
      mockClient as any,
      { function: '$.name', data: { name: 'John' } }
    );

    expect(result).toEqual({
      success: true,
      data: 'John',
    });
  });

  it('should use functionName from environment variable', async () => {
    const { InvokeCommand } = await import('@aws-sdk/client-lambda');

    mockClient.send.mockResolvedValueOnce({
      Payload: new TextEncoder().encode(
        JSON.stringify({ statusCode: 200, body: JSON.stringify({ data: 'test' }) })
      ),
    });

    await jsonataEval(mockClient as any, { function: '$.test', data: {} });

    expect(InvokeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        FunctionName: 'TestFunction',
      })
    );
  });

  it('should prefer explicit functionName over environment variable', async () => {
    const { InvokeCommand } = await import('@aws-sdk/client-lambda');

    mockClient.send.mockResolvedValueOnce({
      Payload: new TextEncoder().encode(
        JSON.stringify({ statusCode: 200, body: JSON.stringify({ data: 'test' }) })
      ),
    });

    await jsonataEval(
      mockClient as any,
      { function: '$.test', data: {} },
      { functionName: 'ExplicitFunction' }
    );

    expect(InvokeCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        FunctionName: 'ExplicitFunction',
      })
    );
  });

  it('should return error when no functionName is available', async () => {
    delete process.env.JSONATA_EVAL_FUNCTION;

    const result = await jsonataEval(
      mockClient as any,
      { function: '$.name', data: {} }
    );

    expect(result).toEqual({
      success: false,
      error: 'Function name not provided. Set JSONATA_EVAL_FUNCTION environment variable or pass functionName option.',
    });
  });

  it('should return error result when Lambda returns an error', async () => {
    const responseBody = JSON.stringify({ error: 'Invalid JSONata expression' });
    const lambdaResponse = {
      statusCode: 400,
      body: responseBody,
    };

    mockClient.send.mockResolvedValueOnce({
      Payload: new TextEncoder().encode(JSON.stringify(lambdaResponse)),
    });

    const result = await jsonataEval(
      mockClient as any,
      { function: 'invalid(', data: {} }
    );

    expect(result).toEqual({
      success: false,
      error: 'Invalid JSONata expression',
    });
  });

  it('should return error result when Lambda execution fails', async () => {
    mockClient.send.mockResolvedValueOnce({
      FunctionError: 'Unhandled',
      Payload: new TextEncoder().encode('{}'),
    });

    const result = await jsonataEval(
      mockClient as any,
      { function: '$.name', data: {} }
    );

    expect(result).toEqual({
      success: false,
      error: 'Lambda execution error: Unhandled',
    });
  });

  it('should return error result when no payload is returned', async () => {
    mockClient.send.mockResolvedValueOnce({});

    const result = await jsonataEval(
      mockClient as any,
      { function: '$.name', data: {} }
    );

    expect(result).toEqual({
      success: false,
      error: 'No payload returned from Lambda',
    });
  });

  it('should return error result when client throws an error', async () => {
    mockClient.send.mockRejectedValueOnce(new Error('Network error'));

    const result = await jsonataEval(
      mockClient as any,
      { function: '$.name', data: {} }
    );

    expect(result).toEqual({
      success: false,
      error: 'Network error',
    });
  });

  it('should handle unknown errors gracefully', async () => {
    mockClient.send.mockRejectedValueOnce('string error');

    const result = await jsonataEval(
      mockClient as any,
      { function: '$.name', data: {} }
    );

    expect(result).toEqual({
      success: false,
      error: 'Unknown error occurred',
    });
  });

  it('should include timeout in payload', async () => {
    mockClient.send.mockResolvedValueOnce({
      Payload: new TextEncoder().encode(
        JSON.stringify({ statusCode: 200, body: JSON.stringify({ data: 'test' }) })
      ),
    });

    await jsonataEval(
      mockClient as any,
      { function: '$.test', data: {} },
      { timeout: 5000 }
    );

    expect(mockClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        Payload: expect.any(Uint8Array),
      })
    );

    // Verify payload contains timeout
    const call = mockClient.send.mock.calls[0][0];
    const payloadStr = new TextDecoder().decode(call.Payload);
    const payload = JSON.parse(payloadStr);
    const body = JSON.parse(payload.body);
    expect(body.timeout).toBe(5000);
  });

  it('should use default timeout of 10000ms', async () => {
    mockClient.send.mockResolvedValueOnce({
      Payload: new TextEncoder().encode(
        JSON.stringify({ statusCode: 200, body: JSON.stringify({ data: 'test' }) })
      ),
    });

    await jsonataEval(mockClient as any, { function: '$.test', data: {} });

    const call = mockClient.send.mock.calls[0][0];
    const payloadStr = new TextDecoder().decode(call.Payload);
    const payload = JSON.parse(payloadStr);
    const body = JSON.parse(payload.body);
    expect(body.timeout).toBe(10000);
  });
});
